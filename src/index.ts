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
} from './types';
import { AsyncWrapper } from './core/async-wrapper';
import { getGlobalRoutePatcher, patchExpressApp } from './core/route-patcher';
import { createGlobalMiddleware } from './middleware/global-middleware';
import { createRequestContext, createEnhancedError, isAsyncFunction } from './utils';

/**
 * Main AsyncSuper class implementation
 */
class AsyncSuperImpl implements AsyncSuper {
  private asyncWrapper: AsyncWrapper;
  private currentConfig: GlobalAsyncSuperConfig | null = null;

  constructor() {
    this.asyncWrapper = new AsyncWrapper();
  }

  /**
   * Configure global async error handling for Express app
   */
  public global(config: GlobalAsyncSuperConfig = {}): RequestHandler {
    this.currentConfig = config;
    
    // Update async wrapper with new config
    this.asyncWrapper = new AsyncWrapper(config);
    
    // Create and return the global middleware
    return createGlobalMiddleware(config);
  }

  /**
   * Wrap individual async route handler
   */
  public wrap<T extends AsyncRouteHandler>(handler: T): WrappedRouteHandler {
    return this.asyncWrapper.wrapRouteHandler(handler);
  }

  /**
   * Wrap individual async error handler
   */
  public wrapError<T extends AsyncErrorHandler>(handler: T): WrappedErrorHandler {
    return this.asyncWrapper.wrapErrorHandler(handler);
  }

  /**
   * Create request context manually
   */
  public createContext(req: Request): RequestContext {
    return createRequestContext(req);
  }

  /**
   * Enhance error with additional context manually
   */
  public enhanceError(error: Error, req?: Request, context?: any): EnhancedError {
    return createEnhancedError(error, req, context);
  }

  /**
   * Get performance metrics for route
   */
  public getMetrics(route?: string): PerformanceMetrics[] {
    return this.asyncWrapper.getPerformanceMetrics(route);
  }

  /**
   * Clear performance metrics
   */
  public clearMetrics(): void {
    this.asyncWrapper.clearPerformanceMetrics();
  }

  /**
   * Check if function is async
   */
  public isAsyncFunction(fn: Function): boolean {
    return this.asyncWrapper.isAsyncFunction(fn);
  }

  /**
   * Get current configuration
   */
  public getConfig(): GlobalAsyncSuperConfig | null {
    return this.currentConfig ? { ...this.currentConfig } : null;
  }
}

/**
 * Global instance
 */
const asyncSuperInstance = new AsyncSuperImpl();

/**
 * Default export - the main AsyncSuper instance
 */
export default asyncSuperInstance;

/**
 * Named exports for specific functionality
 */
export {
  asyncSuperInstance as asyncSuper,
  AsyncWrapper,
  createGlobalMiddleware,
  patchExpressApp,
  createRequestContext,
  createEnhancedError,
  isAsyncFunction
};

/**
 * Export all types for TypeScript users
 */
export * from './types';

/**
 * Utility exports
 */
export {
  generateCorrelationId,
  measurePerformance,
  withTimeout,
  retryWithBackoff,
  sanitizeForLogging,
  formatMemoryUsage,
  categorizeError,
  isRetryableError
} from './utils';

/**
 * Middleware exports
 */
export {
  correlationIdMiddleware,
  requestContextMiddleware,
  performanceMiddleware,
  getGlobalMiddleware,
  resetGlobalMiddleware
} from './middleware/global-middleware';

/**
 * Route patcher exports
 */
export {
  RoutePatcher,
  getGlobalRoutePatcher,
  resetGlobalRoutePatcher,
  isAppPatched,
  unpatchExpressApp
} from './core/route-patcher';

/**
 * Convenience function for quick setup
 */
export function setupAsyncSuper(config: GlobalAsyncSuperConfig = {}) {
  return asyncSuperInstance.global(config);
}

/**
 * Type-safe wrapper function for async route handlers
 */
export function asyncHandler(
  handler: AsyncRouteHandler
): WrappedRouteHandler {
  return asyncSuperInstance.wrap(handler);
}

/**
 * Type-safe wrapper function for async error handlers
 */
export function asyncErrorHandler(
  handler: (error: Error, req: Request, res: any, next: any) => Promise<void>
): WrappedErrorHandler {
  return asyncSuperInstance.wrapError(handler);
}

// CommonJS compatibility
module.exports = asyncSuperInstance;
module.exports.default = asyncSuperInstance;
module.exports.asyncSuper = asyncSuperInstance;
module.exports.setupAsyncSuper = setupAsyncSuper;
module.exports.asyncHandler = asyncHandler;
module.exports.asyncErrorHandler = asyncErrorHandler;