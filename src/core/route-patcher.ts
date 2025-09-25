import { Application, Router, RequestHandler, IRouterMatcher } from 'express';
import { 
  AsyncSuperApp, 
  RoutePatchOptions, 
  AsyncSuperConfig,
  AsyncRouteHandler,
  GlobalAsyncSuperConfig
} from '../types';
import { AsyncWrapper } from './async-wrapper';
import { isAsyncFunction } from '../utils';

/**
 * HTTP methods that can be patched
 */
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'] as const;

/**
 * Express route patching system for global async error handling
 */
export class RoutePatcher {
  private asyncWrapper: AsyncWrapper;
  private config: Required<GlobalAsyncSuperConfig>;
  private originalMethods: Map<string, Function> = new Map();
  private patchedApps: WeakSet<Application | Router> = new WeakSet();

  constructor(config: GlobalAsyncSuperConfig = {}) {
    // Set default values for required config
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

    this.asyncWrapper = new AsyncWrapper(this.config);
  }

  /**
   * Patch Express application or router to automatically wrap async routes
   */
  public patchApp(app: Application | Router): void {
    // Check if app is already patched
    if (this.patchedApps.has(app)) {
      return;
    }

    // Skip if development only and not in development
    if (this.config.developmentOnly && process.env.NODE_ENV === 'production') {
      return;
    }

    const asyncSuperApp = app as Application & AsyncSuperApp;

    // Mark app as async super enabled
    asyncSuperApp._asyncSuperEnabled = true;
    asyncSuperApp._asyncSuperConfig = this.config;
    asyncSuperApp._originalMethods = {};
    asyncSuperApp._trackedHandlers = new WeakMap();
    asyncSuperApp._performanceMetrics = new Map();

    // Patch HTTP methods
    this.patchHttpMethods(app, asyncSuperApp);

    // Patch error handling methods
    if (this.config.patchOptions.errorHandlers) {
      this.patchErrorHandlers(app, asyncSuperApp);
    }

    // Mark as patched
    this.patchedApps.add(app);
  }

  /**
   * Unpatch Express application or router
   */
  public unpatchApp(app: Application | Router): void {
    if (!this.patchedApps.has(app)) {
      return;
    }

    const asyncSuperApp = app as Application & AsyncSuperApp;

    // Restore original methods
    if (asyncSuperApp._originalMethods) {
      for (const [methodName, originalMethod] of Object.entries(asyncSuperApp._originalMethods)) {
        (app as any)[methodName] = originalMethod;
      }
    }

    // Clean up app properties
    delete asyncSuperApp._asyncSuperEnabled;
    delete asyncSuperApp._asyncSuperConfig;
    delete asyncSuperApp._originalMethods;
    delete asyncSuperApp._trackedHandlers;
    delete asyncSuperApp._performanceMetrics;

    // Remove from patched set
    this.patchedApps.delete(app);
  }

  /**
   * Check if app is patched
   */
  public isPatched(app: Application | Router): boolean {
    return this.patchedApps.has(app);
  }

  /**
   * Get async wrapper instance
   */
  public getAsyncWrapper(): AsyncWrapper {
    return this.asyncWrapper;
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
    
    // Update async wrapper config
    this.asyncWrapper = new AsyncWrapper(this.config);
  }

  /**
   * Patch HTTP methods on the app/router
   */
  private patchHttpMethods(app: Application | Router, asyncSuperApp: Application & AsyncSuperApp): void {
    const methodsToPatch = this.config.patchOptions.methods?.filter(method => 
      HTTP_METHODS.includes(method as any)
    ) || HTTP_METHODS;

    for (const method of methodsToPatch) {
      this.patchMethod(app, asyncSuperApp, method);
    }
  }

  /**
   * Patch a specific HTTP method
   */
  private patchMethod(
    app: Application | Router, 
    asyncSuperApp: Application & AsyncSuperApp, 
    method: string
  ): void {
    const originalMethod = (app as any)[method];
    
    if (!originalMethod || typeof originalMethod !== 'function') {
      return;
    }

    // Store original method
    asyncSuperApp._originalMethods![method] = originalMethod;
    this.originalMethods.set(method, originalMethod);

    // Create patched method
    const patchedMethod = this.createPatchedMethod(originalMethod, method);

    // Replace method on app
    (app as any)[method] = patchedMethod;

    // Preserve original method properties
    if (this.config.patchOptions.preserveNames) {
      Object.defineProperty(patchedMethod, 'name', {
        value: originalMethod.name,
        configurable: true
      });
    }
  }

  /**
   * Create patched version of an HTTP method
   */
  private createPatchedMethod(originalMethod: Function, methodName: string): Function {
    const patcher = this;
    
    return function patchedHttpMethod(this: Application | Router, ...args: any[]) {
      // The last argument(s) are typically handlers
      const processedArgs = patcher.processMethodArgs(args, methodName);
      
      // Call original method with processed handlers
      return originalMethod.apply(this, processedArgs);
    };
  }

  /**
   * Process method arguments to wrap async handlers
   */
  private processMethodArgs(args: any[], methodName: string): any[] {
    return args.map((arg, index) => {
      // Skip non-function arguments (paths, options, etc.)
      if (typeof arg !== 'function') {
        return arg;
      }

      // Wrap async functions
      if (isAsyncFunction(arg)) {
        return this.wrapAsyncHandler(arg, methodName, index);
      }

      // For non-async functions, check if they might throw promises
      return this.wrapPotentialAsyncHandler(arg, methodName, index);
    });
  }

  /**
   * Wrap confirmed async handler
   */
  private wrapAsyncHandler(handler: AsyncRouteHandler, methodName: string, index: number): RequestHandler {
    // Use custom wrapper if provided
    if (this.config.patchOptions.customWrapper) {
      return this.config.patchOptions.customWrapper(handler, this.config);
    }

    // Use built-in wrapper
    const wrappedHandler = this.asyncWrapper.wrapRouteHandler(handler);

    // Add metadata for debugging
    (wrappedHandler as any)._asyncSuperWrapped = true;
    (wrappedHandler as any)._originalHandler = handler;
    (wrappedHandler as any)._methodName = methodName;
    (wrappedHandler as any)._handlerIndex = index;

    return wrappedHandler;
  }

  /**
   * Wrap handler that might be async (for safety)
   */
  private wrapPotentialAsyncHandler(handler: Function, methodName: string, index: number): RequestHandler {
    // Create safe wrapper that handles both sync and async
    const safeHandler = async (req: any, res: any, next: any) => {
      try {
        const result = handler(req, res, next);
        
        // If result is a promise, await it
        if (result && typeof result.then === 'function') {
          await result;
        }
        
        return result;
      } catch (error) {
        // Pass error to next for proper handling
        next(error);
      }
    };

    // Use async wrapper for the safe handler
    const wrappedHandler = this.asyncWrapper.wrapRouteHandler(safeHandler as AsyncRouteHandler);

    // Add metadata
    (wrappedHandler as any)._asyncSuperWrapped = true;
    (wrappedHandler as any)._originalHandler = handler;
    (wrappedHandler as any)._methodName = methodName;
    (wrappedHandler as any)._handlerIndex = index;
    (wrappedHandler as any)._potentialAsync = true;

    return wrappedHandler;
  }

  /**
   * Patch error handling methods
   */
  private patchErrorHandlers(app: Application | Router, asyncSuperApp: Application & AsyncSuperApp): void {
    // Patch app.use for error handlers (4-argument functions)
    const originalUse = app.use;
    asyncSuperApp._originalMethods!.use = originalUse;
    const patcher = this;

    app.use = function patchedUse(this: Application | Router, ...args: any[]) {
      const processedArgs = args.map(arg => {
        // Check if it's an error handler (4 parameters: error, req, res, next)
        if (typeof arg === 'function' && arg.length === 4) {
          return patcher.wrapErrorHandler(arg);
        }
        return arg;
      });

      return (originalUse as any).apply(this, processedArgs);
    };

    // Preserve function name
    if (this.config.patchOptions.preserveNames) {
      Object.defineProperty(app.use, 'name', {
        value: originalUse.name,
        configurable: true
      });
    }
  }

  /**
   * Wrap error handler
   */
  private wrapErrorHandler(errorHandler: Function): Function {
    // If already wrapped, return as-is
    if ((errorHandler as any)._asyncSuperWrapped) {
      return errorHandler;
    }

    const wrappedErrorHandler = this.asyncWrapper.wrapErrorHandler(errorHandler as any);

    // Add metadata
    (wrappedErrorHandler as any)._asyncSuperWrapped = true;
    (wrappedErrorHandler as any)._originalHandler = errorHandler;
    (wrappedErrorHandler as any)._isErrorHandler = true;

    return wrappedErrorHandler;
  }

  /**
   * Create middleware that patches new routers/sub-apps automatically
   */
  public createAutoPatchMiddleware(): RequestHandler {
    return (req, res, next) => {
      // This middleware can be used to ensure sub-routers are patched
      // For now, just pass through
      next();
    };
  }

  /**
   * Get patching statistics
   */
  public getStats(): {
    patchedApps: number;
    originalMethods: string[];
    config: GlobalAsyncSuperConfig;
  } {
    return {
      patchedApps: -1, // WeakSet doesn't have size, so we can't count
      originalMethods: Array.from(this.originalMethods.keys()),
      config: { ...this.config }
    };
  }

  /**
   * Reset all patches (for testing)
   */
  public reset(): void {
    // Cannot iterate over WeakSet, but we can clear references
    this.originalMethods.clear();
    // WeakSet will be garbage collected when apps are no longer referenced
  }
}

/**
 * Global instance for singleton behavior
 */
let globalRoutePatcher: RoutePatcher | null = null;

/**
 * Get or create global route patcher instance
 */
export function getGlobalRoutePatcher(config?: GlobalAsyncSuperConfig): RoutePatcher {
  if (!globalRoutePatcher) {
    globalRoutePatcher = new RoutePatcher(config);
  } else if (config) {
    globalRoutePatcher.updateConfig(config);
  }
  
  return globalRoutePatcher;
}

/**
 * Reset global route patcher (mainly for testing)
 */
export function resetGlobalRoutePatcher(): void {
  if (globalRoutePatcher) {
    globalRoutePatcher.reset();
    globalRoutePatcher = null;
  }
}

/**
 * Check if Express app/router is already patched
 */
export function isAppPatched(app: Application | Router): boolean {
  const asyncSuperApp = app as Application & AsyncSuperApp;
  return Boolean(asyncSuperApp._asyncSuperEnabled);
}

/**
 * Utility to manually patch an Express app
 */
export function patchExpressApp(app: Application | Router, config?: GlobalAsyncSuperConfig): void {
  const patcher = getGlobalRoutePatcher(config);
  patcher.patchApp(app);
}

/**
 * Utility to manually unpatch an Express app
 */
export function unpatchExpressApp(app: Application | Router): void {
  const patcher = getGlobalRoutePatcher();
  patcher.unpatchApp(app);
}