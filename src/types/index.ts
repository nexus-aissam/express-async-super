import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
  ErrorRequestHandler,
} from "express";

/**
 * Core configuration options for express-async-super.
 * Configure how async errors are handled, logged, and monitored.
 * 
 * @example
 * ```javascript
 * const config = {
 *   errorLogging: true,
 *   performance: true,
 *   performanceThreshold: 500,
 *   correlationId: true,
 *   logger: (message, level, context) => {
 *     console.log(`[${level.toUpperCase()}] ${message}`, context);
 *   }
 * };
 * 
 * app.use(asyncSuper.global(config));
 * ```
 */
export interface AsyncSuperConfig {
  /** 
   * Enable enhanced error logging to console.
   * Logs caught errors with additional context like correlation ID, route, duration.
   * @default true
   * @example errorLogging: true
   */
  errorLogging?: boolean;
  
  /** 
   * Enable performance monitoring for async operations.
   * Tracks execution time and memory usage of async route handlers.
   * @default false
   * @example performance: true
   */
  performance?: boolean;
  
  /** 
   * Enable automatic error recovery suggestions.
   * Adds helpful suggestions to errors based on error type and context.
   * @default false
   * @example recovery: true
   */
  recovery?: boolean;
  
  /** 
   * Custom error handler for processing enhanced errors.
   * Called before passing error to Express error handling middleware.
   * @param error - Enhanced error with context
   * @param req - Express request object
   * @param res - Express response object
   * @param next - Express next function
   * @example
   * errorHandler: (error, req, res, next) => {
   *   // Log to monitoring service
   *   monitoring.logError(error, req.correlationId);
   *   next(error);
   * }
   */
  errorHandler?: (
    error: EnhancedError,
    req: Request,
    res: Response,
    next: NextFunction
  ) => void;
  
  /** 
   * Performance threshold in milliseconds to log slow operations.
   * Operations exceeding this threshold will be flagged as slow.
   * @default 1000
   * @example performanceThreshold: 500
   */
  performanceThreshold?: number;
  
  /** 
   * Maximum number of errors to track per request context.
   * Prevents memory leaks from requests with many errors.
   * @default 10
   * @example maxErrorHistory: 5
   */
  maxErrorHistory?: number;
  
  /** 
   * Enable request correlation ID tracking.
   * Automatically generates unique IDs for request tracing.
   * @default true
   * @example correlationId: true
   */
  correlationId?: boolean;
  
  /** 
   * Custom logger function for async-super messages.
   * Replace default console logging with your preferred logging solution.
   * @param message - Log message
   * @param level - Log level (info, warn, error)
   * @param context - Additional context data
   * @example
   * logger: (message, level, context) => {
   *   winston.log(level, message, context);
   * }
   */
  logger?: (
    message: string,
    level: "info" | "warn" | "error",
    context?: any
  ) => void;
}

/**
 * Enhanced error with additional context and debugging information.
 * All caught async errors are automatically enhanced with request context,
 * timing information, and debugging aids.
 * 
 * @example
 * ```javascript
 * app.use((err, req, res, next) => {
 *   if (err.correlationId) {
 *     console.log('Enhanced error:', {
 *       message: err.message,
 *       correlationId: err.correlationId,
 *       route: err.routePath,
 *       duration: err.duration,
 *       suggestions: err.suggestions
 *     });
 *   }
 *   res.status(500).json({ error: 'Internal server error', id: err.correlationId });
 * });
 * ```
 */
export interface EnhancedError extends Error {
  /** 
   * Original error that was caught before enhancement.
   * Useful for accessing original error properties.
   */
  originalError?: Error;
  
  /** 
   * Express request object when error occurred.
   * Contains full request context including headers, params, body.
   */
  request?: Request;
  
  /** 
   * Route path where error occurred (e.g., '/users/:id').
   * Helps identify which endpoint caused the error.
   */
  routePath?: string;
  
  /** 
   * HTTP method where error occurred (GET, POST, etc.).
   * Combined with routePath gives full endpoint identification.
   */
  method?: string;
  
  /** 
   * Request correlation ID for distributed tracing.
   * Unique identifier to track requests across services.
   */
  correlationId?: string;
  
  /** 
   * Timestamp when error occurred.
   * Useful for debugging timing issues and log correlation.
   */
  timestamp?: Date;
  
  /** 
   * Duration of async operation before error (in milliseconds).
   * Helps identify if error was due to timeout or slow operation.
   */
  duration?: number;
  
  /** 
   * Suggested recovery actions for this error.
   * Human-readable suggestions for debugging and fixing the error.
   */
  suggestions?: string[];
  
  /** 
   * Additional context data attached to the error.
   * Custom data added during error enhancement.
   */
  context?: Record<string, any>;
  
  /** 
   * Error classification for automatic handling.
   * Categorizes errors for appropriate response handling.
   */
  category?: ErrorCategory;
  
  /** 
   * Whether error is retryable.
   * Indicates if the operation could succeed on retry.
   */
  retryable?: boolean;
  
  /** 
   * Stack trace from async operation start.
   * Enhanced stack trace showing async call chain.
   */
  asyncStack?: string;
}

/**
 * Error categories for automatic classification and handling.
 * Helps determine appropriate response codes and recovery strategies.
 * 
 * @example
 * ```javascript
 * app.use((err, req, res, next) => {
 *   switch (err.category) {
 *     case ErrorCategory.VALIDATION:
 *       return res.status(400).json({ error: 'Invalid input', details: err.message });
 *     case ErrorCategory.AUTHENTICATION:
 *       return res.status(401).json({ error: 'Authentication required' });
 *     case ErrorCategory.DATABASE:
 *       return res.status(503).json({ error: 'Service temporarily unavailable' });
 *     default:
 *       return res.status(500).json({ error: 'Internal server error' });
 *   }
 * });
 * ```
 */
export enum ErrorCategory {
  /** Database connection, query, or constraint errors */
  DATABASE = "database",
  
  /** Network timeouts, connection failures, external API errors */
  NETWORK = "network",
  
  /** Input validation, schema validation, parameter errors */
  VALIDATION = "validation",
  
  /** Login failures, token validation, credential errors */
  AUTHENTICATION = "authentication",
  
  /** Permission denied, access control, role-based errors */
  AUTHORIZATION = "authorization",
  
  /** Domain-specific logic errors, business rule violations */
  BUSINESS_LOGIC = "business_logic",
  
  /** System errors, file system, memory, configuration issues */
  SYSTEM = "system",
  
  /** Uncategorized or unidentified errors */
  UNKNOWN = "unknown",
}

/**
 * Request context tracking information
 */
export interface RequestContext {
  /** Unique correlation ID for request */
  correlationId: string;
  /** Start time of request */
  startTime: Date;
  /** User information if available */
  user?: any;
  /** Session information if available */
  session?: any;
  /** Request metadata */
  metadata: Record<string, any>;
  /** Active async operations count */
  activeOperations: number;
  /** Error history for this request */
  errorHistory: EnhancedError[];
}

/**
 * Performance monitoring data
 */
export interface PerformanceMetrics {
  /** Operation start time */
  startTime: number;
  /** Operation end time */
  endTime?: number;
  /** Operation duration in milliseconds */
  duration?: number;
  /** Memory usage before operation */
  memoryBefore?: NodeJS.MemoryUsage;
  /** Memory usage after operation */
  memoryAfter?: NodeJS.MemoryUsage;
  /** Route path being monitored */
  route?: string;
  /** HTTP method being monitored */
  method?: string;
  /** Whether operation exceeded threshold */
  isSlowOperation?: boolean;
}

/**
 * Async operation wrapper result
 */
export interface AsyncWrapperResult<T = any> {
  /** Whether operation completed successfully */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Error if operation failed */
  error?: EnhancedError;
  /** Performance metrics */
  metrics?: PerformanceMetrics;
  /** Request context */
  context?: RequestContext;
}

/**
 * Generic async function type that can be wrapped
 */
export type AsyncFunction<T extends any[] = any[], R = any> = (
  ...args: T
) => Promise<R>;

/**
 * Express async route handler type
 */
export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<any>;

/**
 * Express async error handler type
 */
export type AsyncErrorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void>;

/**
 * Wrapped route handler with enhanced functionality
 */
export type WrappedRouteHandler = RequestHandler;

/**
 * Wrapped error handler with enhanced functionality
 */
export type WrappedErrorHandler = ErrorRequestHandler;

export interface RoutePatchOptions {
  /** Methods to patch - defaults to all HTTP methods */
  methods?: string[];
  /** Whether to patch error handlers */
  errorHandlers?: boolean;
  /** Whether to preserve original function names */
  preserveNames?: boolean;
  /** Custom wrapper function */
  customWrapper?:
    | ((
        originalHandler: AsyncRouteHandler,
        config: AsyncSuperConfig
      ) => WrappedRouteHandler)
    | undefined;
}

/**
 * Express application extension for tracking
 */
export interface AsyncSuperApp {
  /** Whether async super is enabled */
  _asyncSuperEnabled?: boolean;
  /** Configuration used */
  _asyncSuperConfig?: AsyncSuperConfig;
  /** Original route methods before patching */
  _originalMethods?: Record<string, Function>;
  /** Tracked route handlers */
  _trackedHandlers?: WeakMap<Function, Function>;
  /** Performance metrics storage */
  _performanceMetrics?: Map<string, PerformanceMetrics[]>;
}

/**
 * Extended Express Request with async super context
 */
export interface AsyncSuperRequest extends Request {
  /** Request context for async operations */
  asyncContext?: RequestContext;
  /** Performance start time */
  _asyncStartTime?: number;
  /** Correlation ID for request tracking */
  correlationId?: string;
  /** User object (if using authentication middleware) */
  user?: any;
  /** Session object (if using session middleware) */
  session?: any;
}

/**
 * Extended Express Response with async super features
 */
export interface AsyncSuperResponse extends Response {
  /** Whether response has been enhanced */
  _asyncSuperEnhanced?: boolean;
  /** Original response methods */
  _originalMethods?: Record<string, Function>;
}

/**
 * Global configuration interface
 */
export interface GlobalAsyncSuperConfig extends AsyncSuperConfig {
  /** Whether to automatically patch all routes */
  autoPatch?: boolean;
  /** Route patching options */
  patchOptions?: RoutePatchOptions;
  /** Whether to enable in development mode only */
  developmentOnly?: boolean;
  /** Custom request context factory */
  contextFactory?: (req: Request) => Partial<RequestContext>;
}

/**
 * Error recovery suggestions interface
 */
export interface ErrorRecoveryConfig {
  /** Enable automatic retry for network errors */
  autoRetry?: boolean;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Retry delay in milliseconds */
  retryDelay?: number;
  /** Custom recovery strategies by error type */
  recoveryStrategies?: Record<
    ErrorCategory,
    (error: EnhancedError) => Promise<any>
  >;
}

/**
 * Memory management options
 */
export interface MemoryManagementConfig {
  /** Enable memory leak detection */
  leakDetection?: boolean;
  /** Memory threshold in MB for warnings */
  memoryThreshold?: number;
  /** Maximum age of stored metrics in milliseconds */
  metricsMaxAge?: number;
  /** Automatic cleanup interval in milliseconds */
  cleanupInterval?: number;
}

/**
 * Main AsyncSuper interface - the primary export
 */
export interface AsyncSuper {
  /** Configure global async error handling */
  global(config?: GlobalAsyncSuperConfig): RequestHandler;

  /** Wrap individual async route handler */
  wrap<T extends AsyncRouteHandler>(handler: T): WrappedRouteHandler;

  /** Wrap individual async error handler */
  wrapError<T extends AsyncErrorHandler>(handler: T): WrappedErrorHandler;

  /** Create request context */
  createContext(req: Request): RequestContext;

  /** Enhance error with additional context */
  enhanceError(error: Error, req?: Request, context?: any): EnhancedError;

  /** Get performance metrics for route */
  getMetrics(route?: string): PerformanceMetrics[];

  /** Clear performance metrics */
  clearMetrics(): void;

  /** Check if function is async */
  isAsyncFunction(fn: Function): boolean;

  /** Get current configuration */
  getConfig(): GlobalAsyncSuperConfig | null;
}

/**
 * Internal state management interface
 */
export interface AsyncSuperState {
  /** Global configuration */
  config: GlobalAsyncSuperConfig;
  /** Active request contexts */
  contexts: Map<string, RequestContext>;
  /** Performance metrics storage */
  metrics: Map<string, PerformanceMetrics[]>;
  /** Error recovery handlers */
  recoveryHandlers: Map<ErrorCategory, Function>;
  /** Memory management timers */
  cleanupTimers: NodeJS.Timeout[];
  /** Whether global patching is active */
  globalPatchActive: boolean;
}

/**
 * Utility type for extracting async function parameters
 */
export type AsyncFunctionParams<T> = T extends (
  ...args: infer P
) => Promise<any>
  ? P
  : never;

/**
 * Utility type for extracting async function return type
 */
export type AsyncFunctionReturn<T> = T extends (
  ...args: any[]
) => Promise<infer R>
  ? R
  : never;

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: Required<GlobalAsyncSuperConfig> = {
  errorLogging: true,
  performance: false,
  recovery: false,
  performanceThreshold: 1000,
  maxErrorHistory: 10,
  correlationId: true,
  autoPatch: true,
  developmentOnly: false,
  errorHandler: undefined as any,
  logger: undefined as any,
  patchOptions: {
    methods: ["get", "post", "put", "patch", "delete", "head", "options"],
    errorHandlers: true,
    preserveNames: true,
    customWrapper: undefined,
  },
  contextFactory: undefined as any,
};

/**
 * Type guard to check if error is enhanced
 */
export const isEnhancedError = (error: any): error is EnhancedError => {
  return error && typeof error === "object" && "originalError" in error;
};

/**
 * Type guard to check if request has async context
 */
export const hasAsyncContext = (req: any): req is AsyncSuperRequest => {
  return req && typeof req === "object" && "asyncContext" in req;
};
