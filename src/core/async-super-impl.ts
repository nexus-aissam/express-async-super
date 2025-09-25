import { Request, RequestHandler } from 'express';
import { 
  AsyncSuper,
  AsyncRouteHandler,
  AsyncErrorHandler,
  WrappedRouteHandler,
  WrappedErrorHandler,
  GlobalAsyncSuperConfig,
  EnhancedError,
  PerformanceMetrics,
  RequestContext
} from '../types';
import { AsyncWrapper } from './async-wrapper';
import { createGlobalMiddleware } from '../middleware/global-middleware';
import { createRequestContext, createEnhancedError } from '../utils';

/**
 * Main AsyncSuper class implementation
 * @internal
 */
export class AsyncSuperImpl implements AsyncSuper {
  private asyncWrapper: AsyncWrapper;
  private currentConfig: GlobalAsyncSuperConfig | null = null;

  constructor() {
    this.asyncWrapper = new AsyncWrapper();
  }

  /**
   * Configure global async error handling for Express application.
   * This middleware automatically catches and handles errors from all async route handlers.
   * 
   * @param config - Configuration options for async error handling
   * @returns Express middleware function
   * 
   * @example
   * ```javascript
   * // Basic usage - zero configuration
   * app.use(asyncSuper.global());
   * 
   * // With options
   * app.use(asyncSuper.global({
   *   errorLogging: true,
   *   performance: true,
   *   correlationId: true,
   *   performanceThreshold: 500
   * }));
   * 
   * // Custom error handler
   * app.use(asyncSuper.global({
   *   errorHandler: (error, req, res, next) => {
   *     console.log('Custom error handling:', error.correlationId);
   *     next(error);
   *   }
   * }));
   * ```
   */
  public global(config: GlobalAsyncSuperConfig = {}): RequestHandler {
    this.currentConfig = config;
    
    // Update async wrapper with new config
    this.asyncWrapper = new AsyncWrapper(config);
    
    // Create and return the global middleware
    return createGlobalMiddleware(config);
  }

  /**
   * Wrap individual async route handler with error catching.
   * Use this for fine-grained control when you don't want global middleware.
   * 
   * @param handler - Async route handler function
   * @returns Wrapped route handler with automatic error handling
   * 
   * @example
   * ```javascript
   * // Wrap specific route
   * app.get('/users', asyncSuper.wrap(async (req, res) => {
   *   const users = await User.findAll();
   *   res.json(users);
   * }));
   * 
   * // Works with route parameters
   * app.get('/users/:id', asyncSuper.wrap(async (req, res) => {
   *   const user = await User.findById(req.params.id);
   *   if (!user) throw new Error('User not found');
   *   res.json(user);
   * }));
   * ```
   */
  public wrap<T extends AsyncRouteHandler>(handler: T): WrappedRouteHandler {
    return this.asyncWrapper.wrapRouteHandler(handler);
  }

  /**
   * Wrap async error handler middleware.
   * Useful for async operations within error handling middleware.
   * 
   * @param handler - Async error handler function
   * @returns Wrapped error handler with automatic error handling
   * 
   * @example
   * ```javascript
   * // Async error logging
   * app.use(asyncSuper.wrapError(async (err, req, res, next) => {
   *   await logErrorToDatabase(err);
   *   await notifyAdmins(err);
   *   res.status(500).json({ error: 'Internal server error' });
   * }));
   * 
   * // Async error recovery
   * app.use('/api', asyncSuper.wrapError(async (err, req, res, next) => {
   *   if (err.code === 'NETWORK_ERROR') {
   *     await retryFailedOperation(req);
   *   }
   *   next(err);
   * }));
   * ```
   */
  public wrapError<T extends AsyncErrorHandler>(handler: T): WrappedErrorHandler {
    return this.asyncWrapper.wrapErrorHandler(handler);
  }

  /**
   * Manually create request context for tracking.
   * Useful for custom middleware or when you need context outside of routes.
   * 
   * @param req - Express request object
   * @returns Request context with correlation ID and metadata
   * 
   * @example
   * ```javascript
   * // In custom middleware
   * app.use((req, res, next) => {
   *   req.customContext = asyncSuper.createContext(req);
   *   console.log('Request ID:', req.customContext.correlationId);
   *   next();
   * });
   * 
   * // In route handler
   * app.get('/debug', (req, res) => {
   *   const context = asyncSuper.createContext(req);
   *   res.json({
   *     correlationId: context.correlationId,
   *     timestamp: context.startTime,
   *     metadata: context.metadata
   *   });
   * });
   * ```
   */
  public createContext(req: Request): RequestContext {
    return createRequestContext(req);
  }

  /**
   * Manually enhance an error with additional context and debugging information.
   * 
   * @param error - Original error to enhance
   * @param req - Optional Express request object
   * @param context - Optional additional context data
   * @returns Enhanced error with debugging information
   * 
   * @example
   * ```javascript
   * // Enhance error in catch block
   * try {
   *   await riskyOperation();
   * } catch (error) {
   *   const enhanced = asyncSuper.enhanceError(error, req, {
   *     operation: 'riskyOperation',
   *     userId: req.user?.id
   *   });
   *   throw enhanced;
   * }
   * 
   * // Add context to thrown errors
   * app.get('/process/:id', async (req, res) => {
   *   try {
   *     await processData(req.params.id);
   *   } catch (error) {
   *     const enhanced = asyncSuper.enhanceError(error, req, {
   *       dataId: req.params.id,
   *       timestamp: new Date()
   *     });
   *     throw enhanced; // Will be caught by global handler
   *   }
   * });
   * ```
   */
  public enhanceError(error: Error, req?: Request, context?: any): EnhancedError {
    return createEnhancedError(error, req, context);
  }

  /**
   * Get performance metrics for routes.
   * Useful for monitoring and debugging slow operations.
   * 
   * @param route - Optional route path to filter metrics
   * @returns Array of performance metrics
   * 
   * @example
   * ```javascript
   * // Get all metrics
   * app.get('/admin/metrics', (req, res) => {
   *   const allMetrics = asyncSuper.getMetrics();
   *   res.json(allMetrics);
   * });
   * 
   * // Get metrics for specific route
   * app.get('/admin/metrics/users', (req, res) => {
   *   const userRouteMetrics = asyncSuper.getMetrics('/users');
   *   res.json(userRouteMetrics);
   * });
   * 
   * // Monitor slow operations
   * setInterval(() => {
   *   const metrics = asyncSuper.getMetrics();
   *   const slowOps = metrics.filter(m => m.isSlowOperation);
   *   if (slowOps.length > 0) {
   *     console.warn('Slow operations detected:', slowOps);
   *   }
   * }, 30000);
   * ```
   */
  public getMetrics(route?: string): PerformanceMetrics[] {
    return this.asyncWrapper.getPerformanceMetrics(route);
  }

  /**
   * Clear all stored performance metrics.
   * Useful for memory management and resetting monitoring data.
   * 
   * @example
   * ```javascript
   * // Clear metrics endpoint
   * app.delete('/admin/metrics', (req, res) => {
   *   asyncSuper.clearMetrics();
   *   res.json({ message: 'Metrics cleared successfully' });
   * });
   * 
   * // Periodic cleanup
   * setInterval(() => {
   *   asyncSuper.clearMetrics();
   *   console.log('Metrics cleared for memory management');
   * }, 3600000); // Every hour
   * ```
   */
  public clearMetrics(): void {
    this.asyncWrapper.clearPerformanceMetrics();
  }

  /**
   * Check if a function is async (returns a Promise).
   * Useful for dynamic function wrapping and validation.
   * 
   * @param fn - Function to check
   * @returns True if function is async
   * 
   * @example
   * ```javascript
   * // Validate handlers before wrapping
   * function smartWrap(handler) {
   *   if (asyncSuper.isAsyncFunction(handler)) {
   *     return asyncSuper.wrap(handler);
   *   }
   *   return handler; // Regular sync handler
   * }
   * 
   * // Dynamic route setup
   * const handlers = [syncHandler, asyncHandler, anotherAsyncHandler];
   * handlers.forEach(handler => {
   *   if (asyncSuper.isAsyncFunction(handler)) {
   *     console.log('Wrapping async handler');
   *     app.use(asyncSuper.wrap(handler));
   *   } else {
   *     app.use(handler);
   *   }
   * });
   * ```
   */
  public isAsyncFunction(fn: Function): boolean {
    return this.asyncWrapper.isAsyncFunction(fn);
  }

  /**
   * Get current configuration settings.
   * Useful for debugging and runtime inspection.
   * 
   * @returns Current configuration or null if not set
   * 
   * @example
   * ```javascript
   * // Debug endpoint
   * app.get('/debug/config', (req, res) => {
   *   const config = asyncSuper.getConfig();
   *   res.json({
   *     hasConfig: config !== null,
   *     errorLogging: config?.errorLogging,
   *     performance: config?.performance,
   *     correlationId: config?.correlationId
   *   });
   * });
   * 
   * // Conditional behavior
   * if (asyncSuper.getConfig()?.performance) {
   *   console.log('Performance monitoring is enabled');
   * }
   * ```
   */
  public getConfig(): GlobalAsyncSuperConfig | null {
    return this.currentConfig ? { ...this.currentConfig } : null;
  }
}