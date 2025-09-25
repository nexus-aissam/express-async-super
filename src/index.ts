import { Request } from "express";
import {
  AsyncSuper,
  AsyncRouteHandler,
  WrappedRouteHandler,
  WrappedErrorHandler,
  GlobalAsyncSuperConfig,
} from "./types";
import { AsyncSuperImpl } from "./core/async-super-impl";
import { AsyncWrapper } from "./core/async-wrapper";
import { getGlobalRoutePatcher, patchExpressApp } from "./core/route-patcher";
import { createGlobalMiddleware } from "./middleware/global-middleware";
import {
  createRequestContext,
  createEnhancedError,
  isAsyncFunction,
} from "./utils";

/**
 * Global AsyncSuper instance - ready to use!
 * This is the main instance that gets exported as default.
 */
const asyncSuperInstance: AsyncSuper = new AsyncSuperImpl();

/**
 * Express Async Super - Intelligent async error handling for Express.js
 *
 * Eliminates the need for manual try/catch blocks in async route handlers.
 * Just add `app.use(asyncSuper.global())` and all your async routes are protected!
 *
 * @example
 * ```javascript
 * const express = require('express');
 * const asyncSuper = require('express-async-super');
 *
 * const app = express();
 * app.use(asyncSuper.global()); // Enable global async error handling
 *
 * // All async routes automatically handle errors
 * app.get('/users', async (req, res) => {
 *   const users = await User.findAll(); // No try/catch needed!
 *   res.json(users);
 * });
 *
 * app.listen(3000);
 * ```
 */
export default asyncSuperInstance;

/**
 * Named exports for specific functionality
 * @example
 * ```javascript
 * import { asyncSuper, asyncHandler } from 'express-async-super';
 * ```
 */
export {
  asyncSuperInstance as asyncSuper,
  AsyncWrapper,
  createGlobalMiddleware,
  patchExpressApp,
  createRequestContext,
  createEnhancedError,
  isAsyncFunction,
};

/**
 * Export all types for TypeScript users
 */
export * from "./types";

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
  isRetryableError,
} from "./utils";

/**
 * Middleware exports
 */
export {
  correlationIdMiddleware,
  requestContextMiddleware,
  performanceMiddleware,
  getGlobalMiddleware,
  resetGlobalMiddleware,
} from "./middleware/global-middleware";

/**
 * Route patcher exports
 */
export {
  RoutePatcher,
  getGlobalRoutePatcher,
  resetGlobalRoutePatcher,
  isAppPatched,
  unpatchExpressApp,
} from "./core/route-patcher";

/**
 * Convenience function for quick setup with configuration.
 * Alternative to `asyncSuper.global(config)`.
 *
 * @param config - Configuration options
 * @returns Express middleware function
 *
 * @example
 * ```javascript
 * // Quick setup with config
 * app.use(setupAsyncSuper({
 *   errorLogging: true,
 *   performance: true,
 *   correlationId: true
 * }));
 *
 * // Equivalent to:
 * // app.use(asyncSuper.global({ ... }));
 * ```
 */
export function setupAsyncSuper(config: GlobalAsyncSuperConfig = {}) {
  return asyncSuperInstance.global(config);
}

/**
 * Type-safe wrapper function for individual async route handlers.
 * Alternative to `asyncSuper.wrap(handler)`.
 *
 * @param handler - Async route handler function
 * @returns Wrapped handler with automatic error handling
 *
 * @example
 * ```javascript
 * // Functional style wrapping
 * const getUsers = asyncHandler(async (req, res) => {
 *   const users = await User.findAll();
 *   res.json(users);
 * });
 *
 * app.get('/users', getUsers);
 *
 * // Direct usage
 * app.get('/posts', asyncHandler(async (req, res) => {
 *   const posts = await Post.findAll();
 *   res.json(posts);
 * }));
 * ```
 */
export function asyncHandler(handler: AsyncRouteHandler): WrappedRouteHandler {
  return asyncSuperInstance.wrap(handler);
}

/**
 * Type-safe wrapper function for async error handlers.
 * Alternative to `asyncSuper.wrapError(handler)`.
 *
 * @param handler - Async error handler function
 * @returns Wrapped error handler with automatic error handling
 *
 * @example
 * ```javascript
 * // Async error logging middleware
 * const errorLogger = asyncErrorHandler(async (err, req, res, next) => {
 *   await logToDatabase(err);
 *   await sendAlert(err);
 *   next(err);
 * });
 *
 * app.use(errorLogger);
 *
 * // Async error recovery
 * app.use('/api', asyncErrorHandler(async (err, req, res, next) => {
 *   if (err.retryable) {
 *     await retryOperation(req);
 *   }
 *   next(err);
 * }));
 * ```
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
