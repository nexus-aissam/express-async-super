import { Request, Response, NextFunction, RequestHandler } from 'express';
import { 
  GlobalAsyncSuperConfig, 
  AsyncSuperRequest, 
  RequestContext,
  hasAsyncContext
} from '../types';
import { RoutePatcher, getGlobalRoutePatcher } from '../core/route-patcher';
import { createRequestContext, generateCorrelationId } from '../utils';

/**
 * Global middleware for express-async-super that provides:
 * - Request context initialization
 * - Correlation ID tracking
 * - Automatic Express app patching
 * - Performance monitoring setup
 */
export class GlobalMiddleware {
  private routePatcher: RoutePatcher;
  private config: Required<GlobalAsyncSuperConfig>;

  constructor(config: GlobalAsyncSuperConfig = {}) {
    // Set defaults for required config
    this.config = {
      errorLogging: config.errorLogging ?? true,
      performance: config.performance ?? false,
      recovery: config.recovery ?? false,
      performanceThreshold: config.performanceThreshold ?? 1000,
      maxErrorHistory: config.maxErrorHistory ?? 10,
      correlationId: config.correlationId ?? true,
      autoPatch: config.autoPatch ?? true,
      developmentOnly: config.developmentOnly ?? false,
      errorHandler: config.errorHandler ?? undefined as any,
      logger: config.logger ?? undefined as any,
      patchOptions: {
        methods: config.patchOptions?.methods ?? ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'],
        errorHandlers: config.patchOptions?.errorHandlers ?? true,
        preserveNames: config.patchOptions?.preserveNames ?? true,
        customWrapper: config.patchOptions?.customWrapper ?? undefined
      },
      contextFactory: config.contextFactory ?? undefined as any
    };

    this.routePatcher = getGlobalRoutePatcher(this.config);
  }

  /**
   * Create global middleware function
   */
  public create(): RequestHandler {
    return (req: Request, res: Response, next: NextFunction) => {
      // Auto-patch the app if enabled and not already patched
      if (this.config.autoPatch && req.app && !this.routePatcher.isPatched(req.app)) {
        this.routePatcher.patchApp(req.app);
      }

      // Skip if development only and in production
      if (this.config.developmentOnly && process.env.NODE_ENV === 'production') {
        return next();
      }

      try {
        // Initialize request context
        this.initializeRequestContext(req as AsyncSuperRequest);

        // Setup performance monitoring
        if (this.config.performance) {
          this.setupPerformanceMonitoring(req, res);
        }

        // Setup cleanup on response finish
        this.setupResponseCleanup(req as AsyncSuperRequest, res);

        next();
      } catch (error) {
        // If middleware setup fails, log and continue
        if (this.config.errorLogging && this.config.logger) {
          this.config.logger(
            'Failed to initialize async-super middleware',
            'error',
            error
          );
        } else {
          console.error('Failed to initialize async-super middleware:', error);
        }
        next();
      }
    };
  }

  /**
   * Initialize request context
   */
  private initializeRequestContext(req: AsyncSuperRequest): void {
    // Skip if context already exists
    if (hasAsyncContext(req) && req.asyncContext) {
      return;
    }

    let context: RequestContext;

    // Use custom context factory if provided
    if (this.config.contextFactory) {
      const customContext = this.config.contextFactory(req);
      const extendedReq = req as Request & { user?: any; session?: any };
      context = {
        correlationId: generateCorrelationId(),
        startTime: new Date(),
        user: extendedReq.user,
        session: extendedReq.session,
        metadata: {},
        activeOperations: 0,
        errorHistory: [],
        ...customContext
      };
    } else {
      context = createRequestContext(req);
    }

    // Ensure correlation ID tracking is enabled if configured
    if (this.config.correlationId) {
      // Check for existing correlation ID from headers
      const existingCorrelationId = 
        req.get('X-Correlation-ID') || 
        req.get('X-Request-ID') ||
        req.get('Request-ID');

      if (existingCorrelationId) {
        context.correlationId = existingCorrelationId;
      }

      // Set correlation ID on request for easy access
      req.correlationId = context.correlationId;
    }

    // Attach context to request
    req.asyncContext = context;

    // Store start time for performance tracking
    req._asyncStartTime = Date.now();
  }

  /**
   * Setup performance monitoring
   */
  private setupPerformanceMonitoring(req: Request, res: Response): void {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    // Track when response finishes
    res.on('finish', () => {
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      const duration = endTime - startTime;

      // Log slow requests
      if (duration > this.config.performanceThreshold) {
        const message = `Slow request: ${req.method} ${req.path} took ${duration}ms`;
        const context = {
          method: req.method,
          path: req.path,
          duration,
          statusCode: res.statusCode,
          memoryDiff: {
            rss: endMemory.rss - startMemory.rss,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed
          }
        };

        if (this.config.logger) {
          this.config.logger(message, 'warn', context);
        } else {
          console.warn(`[PERFORMANCE] ${message}`, context);
        }
      }
    });
  }

  /**
   * Setup cleanup on response finish
   */
  private setupResponseCleanup(req: AsyncSuperRequest, res: Response): void {
    const cleanup = () => {
      try {
        // Clean up request context
        if (req.asyncContext) {
          // Log any remaining active operations
          if (req.asyncContext.activeOperations > 0 && this.config.errorLogging) {
            const message = `Request finished with ${req.asyncContext.activeOperations} active async operations`;
            if (this.config.logger) {
              this.config.logger(message, 'warn', {
                correlationId: req.asyncContext.correlationId,
                path: req.path,
                activeOperations: req.asyncContext.activeOperations
              });
            } else {
              console.warn(`[ASYNC-SUPER] ${message}`);
            }
          }

          // Clear context references to prevent memory leaks
          req.asyncContext.errorHistory = [];
          req.asyncContext.metadata = {};
        }
      } catch (error) {
        // Silently handle cleanup errors to prevent crashes
        if (this.config.errorLogging) {
          console.error('Error during async-super cleanup:', error);
        }
      }
    };

    // Cleanup on response finish
    res.on('finish', cleanup);
    res.on('close', cleanup);
  }

  /**
   * Get current configuration
   */
  public getConfig(): GlobalAsyncSuperConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  public updateConfig(newConfig: Partial<GlobalAsyncSuperConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      patchOptions: {
        ...this.config.patchOptions,
        ...newConfig.patchOptions
      }
    };

    // Update route patcher config
    this.routePatcher.updateConfig(this.config);
  }

  /**
   * Get route patcher instance
   */
  public getRoutePatcher(): RoutePatcher {
    return this.routePatcher;
  }
}

/**
 * Global middleware instance for singleton behavior
 */
let globalMiddleware: GlobalMiddleware | null = null;

/**
 * Create global async-super middleware
 */
export function createGlobalMiddleware(config?: GlobalAsyncSuperConfig): RequestHandler {
  if (!globalMiddleware) {
    globalMiddleware = new GlobalMiddleware(config);
  } else if (config) {
    globalMiddleware.updateConfig(config);
  }

  return globalMiddleware.create();
}

/**
 * Get existing global middleware instance
 */
export function getGlobalMiddleware(): GlobalMiddleware | null {
  return globalMiddleware;
}

/**
 * Reset global middleware (mainly for testing)
 */
export function resetGlobalMiddleware(): void {
  globalMiddleware = null;
}

/**
 * Correlation ID middleware - can be used independently
 */
export function correlationIdMiddleware(
  headerName = 'X-Correlation-ID',
  generateId = generateCorrelationId
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get or generate correlation ID
    let correlationId = req.get(headerName);
    if (!correlationId) {
      correlationId = generateId();
    }

    // Set on request
    (req as AsyncSuperRequest).correlationId = correlationId;

    // Set response header
    res.setHeader(headerName, correlationId);

    next();
  };
}

/**
 * Request context middleware - can be used independently
 */
export function requestContextMiddleware(
  contextFactory?: (req: Request) => Partial<RequestContext>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const asyncReq = req as AsyncSuperRequest;
    
    // Skip if context already exists
    if (hasAsyncContext(asyncReq) && asyncReq.asyncContext) {
      return next();
    }

    let context: RequestContext;

    if (contextFactory) {
      const customContext = contextFactory(req);
      const extendedReq = req as Request & { user?: any; session?: any };
      context = {
        correlationId: asyncReq.correlationId || generateCorrelationId(),
        startTime: new Date(),
        user: extendedReq.user,
        session: extendedReq.session,
        metadata: {},
        activeOperations: 0,
        errorHistory: [],
        ...customContext
      };
    } else {
      context = createRequestContext(req);
    }

    asyncReq.asyncContext = context;
    next();
  };
}

/**
 * Performance monitoring middleware - can be used independently
 */
export function performanceMiddleware(
  threshold = 1000,
  logger?: (message: string, level: 'info' | 'warn' | 'error', context?: any) => void
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    const logPerformance = () => {
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      const duration = endTime - startTime;

      if (duration > threshold) {
        const message = `Slow request: ${req.method} ${req.path} took ${duration}ms`;
        const context = {
          method: req.method,
          path: req.path,
          url: req.url,
          duration,
          statusCode: res.statusCode,
          memoryDiff: {
            rss: endMemory.rss - startMemory.rss,
            heapUsed: endMemory.heapUsed - startMemory.heapUsed,
            heapTotal: endMemory.heapTotal - startMemory.heapTotal
          }
        };

        if (logger) {
          logger(message, 'warn', context);
        } else {
          console.warn(`[PERFORMANCE] ${message}`, context);
        }
      }
    };

    res.on('finish', logPerformance);
    next();
  };
}