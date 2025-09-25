import { Request, Response, NextFunction } from 'express';
import {
  AsyncRouteHandler,
  AsyncErrorHandler,
  EnhancedError,
  PerformanceMetrics,
  RequestContext,
  AsyncSuperConfig,
  ErrorCategory,
  AsyncWrapperResult,
  AsyncSuperRequest,
  hasAsyncContext
} from '../types';
import { generateCorrelationId, measurePerformance, createEnhancedError } from '../utils';

/**
 * Core async wrapper that handles promise rejections and adds enhanced error context
 */
export class AsyncWrapper {
  private config: Required<AsyncSuperConfig>;
  private performanceMetrics: Map<string, PerformanceMetrics[]> = new Map();

  constructor(config: AsyncSuperConfig = {}) {
    this.config = {
      errorLogging: config.errorLogging ?? true,
      performance: config.performance ?? false,
      recovery: config.recovery ?? false,
      performanceThreshold: config.performanceThreshold ?? 1000,
      maxErrorHistory: config.maxErrorHistory ?? 10,
      correlationId: config.correlationId ?? true,
      errorHandler: config.errorHandler ?? this.defaultErrorHandler.bind(this),
      logger: config.logger ?? this.defaultLogger.bind(this)
    };
  }

  /**
   * Wraps an async route handler with error handling and performance monitoring
   */
  public wrapRouteHandler(handler: AsyncRouteHandler): (req: Request, res: Response, next: NextFunction) => void {
    // Preserve original function name and properties
    const wrappedHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const startTime = Date.now();
      let context: RequestContext | undefined;
      
      try {
        // Create or get request context
        context = this.getOrCreateContext(req as AsyncSuperRequest);
        
        // Start performance monitoring if enabled
        let performanceMetrics: PerformanceMetrics | undefined;
        if (this.config.performance) {
          performanceMetrics = this.startPerformanceMonitoring(req, startTime);
        }

        // Increment active operations counter
        if (context) {
          context.activeOperations++;
        }

        // Execute the original async handler
        const result = await handler(req, res, next);

        // Complete performance monitoring
        if (this.config.performance && performanceMetrics) {
          this.completePerformanceMonitoring(performanceMetrics, req);
        }

        // Decrement active operations counter
        if (context) {
          context.activeOperations = Math.max(0, context.activeOperations - 1);
        }

        return result;

      } catch (error) {
        // Handle the error with enhanced context
        await this.handleAsyncError(error as Error, req, res, next, context, startTime);
      }
    };

    // Preserve original function properties
    Object.defineProperty(wrappedHandler, 'name', {
      value: handler.name || 'asyncHandler',
      configurable: true
    });

    return wrappedHandler;
  }

  /**
   * Wraps an async error handler 
   */
  public wrapErrorHandler(handler: AsyncErrorHandler): (error: Error, req: Request, res: Response, next: NextFunction) => void {
    const wrappedErrorHandler = async (error: Error, req: Request, res: Response, next: NextFunction): Promise<void> => {
      const startTime = Date.now();
      let context: RequestContext | undefined;

      try {
        context = this.getOrCreateContext(req as AsyncSuperRequest);
        
        // Add error to context history
        if (context) {
          const enhancedError = createEnhancedError(error, req, {
            timestamp: new Date(),
            correlationId: context.correlationId
          });
          
          context.errorHistory.push(enhancedError);
          
          // Maintain max error history limit
          if (context.errorHistory.length > this.config.maxErrorHistory) {
            context.errorHistory.shift();
          }
        }

        // Execute the original error handler
        await handler(error, req, res, next);

      } catch (handlerError) {
        // If error handler itself throws, enhance and pass to next
        const enhancedError = this.createEnhancedError(handlerError as Error, req, context, startTime);
        this.logError(enhancedError);
        next(enhancedError);
      }
    };

    // Preserve original function properties
    Object.defineProperty(wrappedErrorHandler, 'name', {
      value: handler.name || 'asyncErrorHandler', 
      configurable: true
    });

    return wrappedErrorHandler;
  }

  /**
   * Generic async function wrapper with result object
   */
  public async wrapAsyncFunction<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    ...args: T
  ): Promise<AsyncWrapperResult<R>> {
    const startTime = Date.now();
    
    try {
      const result = await fn(...args);
      
      const wrapperResult: AsyncWrapperResult<R> = {
        success: true,
        data: result
      };

      if (this.config.performance) {
        wrapperResult.metrics = {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime
        };
      }

      return wrapperResult;
      
    } catch (error) {
      const enhancedError = createEnhancedError(error as Error, undefined, {
        timestamp: new Date(),
        duration: Date.now() - startTime
      });

      const wrapperResult: AsyncWrapperResult<R> = {
        success: false,
        error: enhancedError
      };

      if (this.config.performance) {
        wrapperResult.metrics = {
          startTime,
          endTime: Date.now(),
          duration: Date.now() - startTime
        };
      }

      return wrapperResult;
    }
  }

  /**
   * Check if a function is async
   */
  public isAsyncFunction(fn: Function): boolean {
    return fn.constructor.name === 'AsyncFunction' || 
           (typeof fn === 'function' && fn.toString().includes('async'));
  }

  /**
   * Get performance metrics for a route
   */
  public getPerformanceMetrics(route?: string): PerformanceMetrics[] {
    if (route) {
      return this.performanceMetrics.get(route) || [];
    }
    
    // Return all metrics
    const allMetrics: PerformanceMetrics[] = [];
    this.performanceMetrics.forEach(metrics => allMetrics.push(...metrics));
    return allMetrics;
  }

  /**
   * Clear performance metrics
   */
  public clearPerformanceMetrics(): void {
    this.performanceMetrics.clear();
  }

  /**
   * Get or create request context
   */
  private getOrCreateContext(req: AsyncSuperRequest): RequestContext {
    if (!hasAsyncContext(req) || !req.asyncContext) {
      const correlationId = this.config.correlationId ? 
        (req.correlationId || generateCorrelationId()) : 
        'no-correlation';

      req.asyncContext = {
        correlationId,
        startTime: new Date(),
        user: req.user,
        session: req.session,
        metadata: {},
        activeOperations: 0,
        errorHistory: []
      };

      // Store correlation ID on request for easy access
      req.correlationId = correlationId;
    }

    return req.asyncContext;
  }

  /**
   * Handle async errors with enhanced context
   */
  private async handleAsyncError(
    error: Error,
    req: Request,
    res: Response,
    next: NextFunction,
    context?: RequestContext,
    startTime?: number
  ): Promise<void> {
    // Create enhanced error with full context
    const enhancedError = this.createEnhancedError(error, req, context, startTime);

    // Add error to context history
    if (context) {
      context.errorHistory.push(enhancedError);
      if (context.errorHistory.length > this.config.maxErrorHistory) {
        context.errorHistory.shift();
      }
      // Decrement operations counter
      context.activeOperations = Math.max(0, context.activeOperations - 1);
    }

    // Log error if enabled
    if (this.config.errorLogging) {
      this.logError(enhancedError);
    }

    // Generate recovery suggestions if enabled
    if (this.config.recovery) {
      enhancedError.suggestions = this.generateRecoverySuggestions(enhancedError);
    }

    // Call custom error handler if provided, otherwise use default
    try {
      await this.config.errorHandler(enhancedError, req, res, next);
    } catch (handlerError) {
      // If custom error handler fails, fall back to express default
      this.logError(handlerError as Error, 'Error handler failed');
      next(enhancedError);
    }
  }

  /**
   * Create enhanced error with full context
   */
  private createEnhancedError(
    error: Error,
    req?: Request,
    context?: RequestContext,
    startTime?: number
  ): EnhancedError {
    const enhancedError: EnhancedError = {
      ...error,
      name: error.name,
      message: error.message,
      stack: error.stack || '',
      originalError: error,
      timestamp: new Date(),
      correlationId: context?.correlationId || generateCorrelationId(),
      category: this.categorizeError(error),
      retryable: this.isRetryableError(error)
    };

    // Conditionally add request if available
    if (req) {
      enhancedError.request = req;
    }

    // Add request-specific context
    if (req) {
      enhancedError.routePath = req.route?.path || req.path;
      enhancedError.method = req.method;
      enhancedError.context = {
        url: req.url,
        headers: req.headers,
        params: req.params,
        query: req.query,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      };
    }

    // Add timing information
    if (startTime) {
      enhancedError.duration = Date.now() - startTime;
    }

    // Add async stack trace
    enhancedError.asyncStack = this.captureAsyncStack();

    return enhancedError;
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(req: Request, startTime: number): PerformanceMetrics {
    return {
      startTime,
      route: req.route?.path || req.path,
      method: req.method,
      memoryBefore: process.memoryUsage()
    };
  }

  /**
   * Complete performance monitoring
   */
  private completePerformanceMonitoring(metrics: PerformanceMetrics, req: Request): void {
    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.memoryAfter = process.memoryUsage();
    metrics.isSlowOperation = metrics.duration > this.config.performanceThreshold;

    // Store metrics
    const routeKey = `${req.method} ${req.route?.path || req.path}`;
    if (!this.performanceMetrics.has(routeKey)) {
      this.performanceMetrics.set(routeKey, []);
    }
    this.performanceMetrics.get(routeKey)!.push(metrics);

    // Log slow operations
    if (metrics.isSlowOperation && this.config.errorLogging) {
      this.config.logger(
        `Slow operation detected: ${routeKey} took ${metrics.duration}ms`,
        'warn',
        metrics
      );
    }
  }

  /**
   * Categorize error for better handling
   */
  private categorizeError(error: Error): ErrorCategory {
    const message = error.message.toLowerCase();
    const name = error.name.toLowerCase();

    if (message.includes('connect') || message.includes('timeout') || name.includes('network')) {
      return ErrorCategory.NETWORK;
    }
    if (message.includes('database') || message.includes('sql') || name.includes('sequelize')) {
      return ErrorCategory.DATABASE;
    }
    if (message.includes('validation') || name.includes('validation')) {
      return ErrorCategory.VALIDATION;
    }
    if (message.includes('unauthorized') || message.includes('forbidden') || name.includes('auth')) {
      return ErrorCategory.AUTHENTICATION;
    }
    if (name.includes('system') || message.includes('enoent') || message.includes('eacces')) {
      return ErrorCategory.SYSTEM;
    }

    return ErrorCategory.UNKNOWN;
  }

  /**
   * Determine if error is retryable
   */
  private isRetryableError(error: Error): boolean {
    const category = this.categorizeError(error);
    const message = error.message.toLowerCase();

    // Network errors are typically retryable
    if (category === ErrorCategory.NETWORK) {
      return true;
    }

    // Some database errors are retryable
    if (category === ErrorCategory.DATABASE && (
      message.includes('timeout') || 
      message.includes('connection') ||
      message.includes('temporary')
    )) {
      return true;
    }

    // System errors like ENOENT are usually not retryable
    if (category === ErrorCategory.SYSTEM) {
      return false;
    }

    // Validation errors are not retryable
    if (category === ErrorCategory.VALIDATION) {
      return false;
    }

    return false;
  }

  /**
   * Generate recovery suggestions based on error type
   */
  private generateRecoverySuggestions(error: EnhancedError): string[] {
    const suggestions: string[] = [];

    switch (error.category) {
      case ErrorCategory.NETWORK:
        suggestions.push('Check network connectivity');
        suggestions.push('Verify external service endpoints');
        if (error.retryable) {
          suggestions.push('Consider implementing retry logic with exponential backoff');
        }
        break;

      case ErrorCategory.DATABASE:
        suggestions.push('Check database connection');
        suggestions.push('Verify database credentials');
        suggestions.push('Check if database schema matches expectations');
        break;

      case ErrorCategory.VALIDATION:
        suggestions.push('Verify input data format');
        suggestions.push('Check required fields are provided');
        suggestions.push('Validate data types and constraints');
        break;

      case ErrorCategory.AUTHENTICATION:
        suggestions.push('Check authentication credentials');
        suggestions.push('Verify user permissions');
        suggestions.push('Check if session is still valid');
        break;

      case ErrorCategory.SYSTEM:
        suggestions.push('Check file system permissions');
        suggestions.push('Verify file paths exist');
        suggestions.push('Check available disk space');
        break;

      default:
        suggestions.push('Check error details for specific guidance');
        suggestions.push('Review application logs for more context');
    }

    return suggestions;
  }

  /**
   * Capture async stack trace
   */
  private captureAsyncStack(): string {
    const stack = new Error().stack || '';
    return stack
      .split('\n')
      .filter(line => line.includes('at ') && !line.includes(__filename))
      .slice(0, 10)
      .join('\n');
  }

  /**
   * Default error handler
   */
  private async defaultErrorHandler(
    error: EnhancedError,
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    // If response already sent, delegate to Express default handler
    if (res.headersSent) {
      return next(error);
    }

    // Send appropriate error response
    const statusCode = this.getStatusCodeFromError(error);
    const errorResponse = this.createErrorResponse(error);

    res.status(statusCode).json(errorResponse);
  }

  /**
   * Get appropriate HTTP status code from error
   */
  private getStatusCodeFromError(error: EnhancedError): number {
    // Check for specific status code on error
    if ('statusCode' in error && typeof error.statusCode === 'number') {
      return error.statusCode;
    }
    if ('status' in error && typeof error.status === 'number') {
      return error.status;
    }

    // Determine status based on error category
    switch (error.category) {
      case ErrorCategory.VALIDATION:
        return 400;
      case ErrorCategory.AUTHENTICATION:
        return 401;
      case ErrorCategory.AUTHORIZATION:
        return 403;
      case ErrorCategory.DATABASE:
      case ErrorCategory.NETWORK:
      case ErrorCategory.SYSTEM:
        return 500;
      default:
        return 500;
    }
  }

  /**
   * Create error response object
   */
  private createErrorResponse(error: EnhancedError): any {
    const isDevelopment = process.env.NODE_ENV !== 'production';

    const response: any = {
      error: {
        message: error.message,
        correlationId: error.correlationId,
        timestamp: error.timestamp?.toISOString(),
        category: error.category
      }
    };

    // Include additional details in development
    if (isDevelopment) {
      response.error.details = {
        route: error.routePath,
        method: error.method,
        duration: error.duration,
        suggestions: error.suggestions,
        retryable: error.retryable
      };

      // Include stack trace in development
      response.error.stack = error.stack;
    }

    return response;
  }

  /**
   * Default logger implementation
   */
  private defaultLogger(message: string, level: 'info' | 'warn' | 'error', context?: any): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    switch (level) {
      case 'error':
        console.error(logMessage, context || '');
        break;
      case 'warn':
        console.warn(logMessage, context || '');
        break;
      case 'info':
      default:
        console.log(logMessage, context || '');
        break;
    }
  }

  /**
   * Log error with context
   */
  private logError(error: Error | EnhancedError, prefix = 'Async Error'): void {
    const isEnhanced = 'correlationId' in error;
    
    this.config.logger(
      `${prefix}: ${error.message}`,
      'error',
      isEnhanced ? {
        correlationId: error.correlationId,
        route: error.routePath,
        method: error.method,
        category: error.category,
        retryable: error.retryable,
        stack: error.stack
      } : { stack: error.stack }
    );
  }
}