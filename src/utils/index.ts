import { Request } from 'express';
import { 
  EnhancedError, 
  PerformanceMetrics, 
  RequestContext,
  ErrorCategory 
} from '../types';

/**
 * Generate a unique correlation ID for request tracking
 */
export function generateCorrelationId(): string {
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 9);
  return `async-${timestamp}-${randomPart}`;
}

/**
 * Create enhanced error with additional context
 */
export function createEnhancedError(
  originalError: Error, 
  req?: Request, 
  additionalContext?: Partial<EnhancedError>
): EnhancedError {
  const enhancedError: EnhancedError = {
    ...originalError,
    name: originalError.name,
    message: originalError.message,
    stack: originalError.stack || '',
    originalError,
    timestamp: new Date(),
    ...additionalContext
  };

  // Add request context if available
  if (req) {
    enhancedError.request = req;
    enhancedError.routePath = req.route?.path || req.path;
    enhancedError.method = req.method;
    enhancedError.context = {
      url: req.url,
      headers: req.headers,
      params: req.params,
      query: req.query,
      body: req.body,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      hostname: req.hostname
    };
  }

  return enhancedError;
}

/**
 * Measure performance of an operation
 */
export function measurePerformance<T>(
  operation: () => Promise<T>,
  context?: { route?: string; method?: string }
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();
    const memoryBefore = process.memoryUsage();

    try {
      const result = await operation();
      const endTime = Date.now();
      const memoryAfter = process.memoryUsage();

      const metrics: PerformanceMetrics = {
        startTime,
        endTime,
        duration: endTime - startTime,
        memoryBefore,
        memoryAfter
      };

      if (context?.route) {
        metrics.route = context.route;
      }
      if (context?.method) {
        metrics.method = context.method;
      }

      resolve({ result, metrics });
    } catch (error) {
      const endTime = Date.now();
      const memoryAfter = process.memoryUsage();

      const metrics: PerformanceMetrics = {
        startTime,
        endTime,
        duration: endTime - startTime,
        memoryBefore,
        memoryAfter
      };

      if (context?.route) {
        metrics.route = context.route;
      }
      if (context?.method) {
        metrics.method = context.method;
      }

      // Attach metrics to error for debugging
      if (error && typeof error === 'object') {
        (error as any).performanceMetrics = metrics;
      }

      reject(error);
    }
  });
}

/**
 * Safely execute async operation with timeout
 */
export function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  timeoutMessage = 'Operation timed out'
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      const error = new Error(timeoutMessage);
      (error as any).code = 'OPERATION_TIMEOUT';
      (error as any).timeout = timeoutMs;
      reject(error);
    }, timeoutMs);

    operation
      .then(result => {
        clearTimeout(timeoutHandle);
        resolve(result);
      })
      .catch(error => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
  });
}

/**
 * Retry async operation with exponential backoff
 */
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000,
  backoffFactor = 2,
  jitter = true
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }
      
      // Calculate delay with exponential backoff
      let delay = baseDelay * Math.pow(backoffFactor, attempt);
      
      // Add jitter to prevent thundering herd
      if (jitter) {
        delay *= (0.5 + Math.random() * 0.5);
      }
      
      // Wait before retry
      await sleep(delay);
    }
  }
  
  throw lastError!;
}

/**
 * Sleep utility for delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, any>>(target: T, ...sources: Partial<T>[]): T {
  if (!sources.length) return target;
  const source = sources.shift();

  if (source) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') {
          target[key] = {} as any;
        }
        deepMerge(target[key], source[key] as any);
      } else {
        target[key] = source[key] as any;
      }
    }
  }

  return deepMerge(target, ...sources);
}

/**
 * Safely stringify object for logging
 */
export function safeStringify(obj: any, maxDepth = 3, currentDepth = 0): string {
  if (currentDepth >= maxDepth) {
    return '[Max Depth Reached]';
  }

  try {
    if (obj === null || obj === undefined) {
      return String(obj);
    }

    if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
      return String(obj);
    }

    if (obj instanceof Error) {
      return `Error: ${obj.message}`;
    }

    if (obj instanceof Date) {
      return obj.toISOString();
    }

    if (Array.isArray(obj)) {
      const items = obj.slice(0, 10).map(item => 
        safeStringify(item, maxDepth, currentDepth + 1)
      );
      if (obj.length > 10) {
        items.push(`... and ${obj.length - 10} more items`);
      }
      return `[${items.join(', ')}]`;
    }

    if (typeof obj === 'object') {
      const entries = Object.entries(obj).slice(0, 20);
      const pairs = entries.map(([key, value]) => 
        `${key}: ${safeStringify(value, maxDepth, currentDepth + 1)}`
      );
      
      if (Object.keys(obj).length > 20) {
        pairs.push(`... and ${Object.keys(obj).length - 20} more properties`);
      }
      
      return `{${pairs.join(', ')}}`;
    }

    return String(obj);
  } catch {
    return '[Unstringifiable Object]';
  }
}

/**
 * Check if function is async
 */
export function isAsyncFunction(fn: Function): boolean {
  return fn.constructor.name === 'AsyncFunction' ||
         fn.toString().trim().startsWith('async ') ||
         fn.toString().includes('return __awaiter');
}

/**
 * Get memory usage in human readable format
 */
export function formatMemoryUsage(memoryUsage: NodeJS.MemoryUsage): Record<string, string> {
  const formatBytes = (bytes: number): string => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(2)} MB`;
  };

  return {
    rss: formatBytes(memoryUsage.rss),
    heapTotal: formatBytes(memoryUsage.heapTotal),
    heapUsed: formatBytes(memoryUsage.heapUsed),
    external: formatBytes(memoryUsage.external),
    arrayBuffers: formatBytes(memoryUsage.arrayBuffers || 0)
  };
}

/**
 * Calculate memory difference between two usage snapshots
 */
export function calculateMemoryDiff(
  before: NodeJS.MemoryUsage, 
  after: NodeJS.MemoryUsage
): Record<string, number> {
  return {
    rss: after.rss - before.rss,
    heapTotal: after.heapTotal - before.heapTotal,
    heapUsed: after.heapUsed - before.heapUsed,
    external: after.external - before.external,
    arrayBuffers: (after.arrayBuffers || 0) - (before.arrayBuffers || 0)
  };
}

/**
 * Sanitize sensitive data from objects for logging
 */
export function sanitizeForLogging(obj: any, sensitiveKeys = ['password', 'token', 'secret', 'key', 'auth']): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForLogging(item, sensitiveKeys));
  }

  const sanitized: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitiveKeys.some(sensitiveKey => 
      keyLower.includes(sensitiveKey.toLowerCase())
    );

    if (isSensitive) {
      sanitized[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      sanitized[key] = sanitizeForLogging(value, sensitiveKeys);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Create a request context from Express request
 */
export function createRequestContext(req: Request): RequestContext {
  const extendedReq = req as Request & { user?: any; session?: any };
  
  return {
    correlationId: generateCorrelationId(),
    startTime: new Date(),
    user: extendedReq.user,
    session: extendedReq.session,
    metadata: {
      url: req.url,
      method: req.method,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      hostname: req.hostname
    },
    activeOperations: 0,
    errorHistory: []
  };
}

/**
 * Validate configuration object
 */
export function validateConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config && typeof config !== 'object') {
    errors.push('Configuration must be an object');
    return { valid: false, errors };
  }

  if (config?.performanceThreshold !== undefined) {
    if (typeof config.performanceThreshold !== 'number' || config.performanceThreshold < 0) {
      errors.push('performanceThreshold must be a positive number');
    }
  }

  if (config?.maxErrorHistory !== undefined) {
    if (typeof config.maxErrorHistory !== 'number' || config.maxErrorHistory < 1) {
      errors.push('maxErrorHistory must be a positive number');
    }
  }

  if (config?.errorHandler !== undefined) {
    if (typeof config.errorHandler !== 'function') {
      errors.push('errorHandler must be a function');
    }
  }

  if (config?.logger !== undefined) {
    if (typeof config.logger !== 'function') {
      errors.push('logger must be a function');
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Get error category from error instance
 */
export function categorizeError(error: Error): ErrorCategory {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  const stack = error.stack?.toLowerCase() || '';

  // Network errors
  if (message.includes('connect') || 
      message.includes('timeout') || 
      message.includes('network') ||
      message.includes('fetch') ||
      name.includes('network') ||
      (error as any).code === 'ECONNREFUSED' ||
      (error as any).code === 'ENOTFOUND') {
    return ErrorCategory.NETWORK;
  }

  // Database errors
  if (message.includes('database') || 
      message.includes('sql') || 
      message.includes('connection') ||
      name.includes('sequelize') ||
      name.includes('mongo') ||
      name.includes('redis') ||
      stack.includes('database') ||
      stack.includes('mongoose')) {
    return ErrorCategory.DATABASE;
  }

  // Validation errors
  if (message.includes('validation') || 
      message.includes('invalid') ||
      message.includes('required') ||
      name.includes('validation') ||
      name.includes('joi') ||
      name.includes('yup')) {
    return ErrorCategory.VALIDATION;
  }

  // Authentication errors
  if (message.includes('unauthorized') || 
      message.includes('authentication') ||
      message.includes('login') ||
      message.includes('token') ||
      name.includes('auth') ||
      (error as any).statusCode === 401) {
    return ErrorCategory.AUTHENTICATION;
  }

  // Authorization errors
  if (message.includes('forbidden') || 
      message.includes('permission') ||
      message.includes('access denied') ||
      (error as any).statusCode === 403) {
    return ErrorCategory.AUTHORIZATION;
  }

  // System errors
  if (name.includes('system') || 
      message.includes('enoent') || 
      message.includes('eacces') ||
      message.includes('file system') ||
      (error as any).code?.startsWith('E')) {
    return ErrorCategory.SYSTEM;
  }

  return ErrorCategory.UNKNOWN;
}

/**
 * Check if error is retryable based on its characteristics
 */
export function isRetryableError(error: Error): boolean {
  const category = categorizeError(error);
  const message = error.message.toLowerCase();
  const code = (error as any).code;

  // Network errors are generally retryable
  if (category === ErrorCategory.NETWORK) {
    return true;
  }

  // Some database errors are retryable
  if (category === ErrorCategory.DATABASE) {
    if (message.includes('timeout') || 
        message.includes('connection') ||
        message.includes('temporary') ||
        code === 'ECONNRESET' ||
        code === 'ETIMEDOUT') {
      return true;
    }
  }

  // System errors are usually not retryable
  if (category === ErrorCategory.SYSTEM) {
    return false;
  }

  // Validation and auth errors are not retryable
  if (category === ErrorCategory.VALIDATION || 
      category === ErrorCategory.AUTHENTICATION ||
      category === ErrorCategory.AUTHORIZATION) {
    return false;
  }

  // 5xx status codes are generally retryable, 4xx are not
  const statusCode = (error as any).statusCode || (error as any).status;
  if (statusCode) {
    return statusCode >= 500 && statusCode < 600;
  }

  return false;
}

/**
 * Throttle function calls to prevent spam
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limitMs: number
): T & { reset: () => void } {
  let lastCallTime = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  const throttledFunc = ((...args: Parameters<T>) => {
    const now = Date.now();
    
    if (now - lastCallTime >= limitMs) {
      lastCallTime = now;
      return func(...args);
    }
    
    // Clear existing timeout and set new one
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      lastCallTime = Date.now();
      func(...args);
      timeoutId = null;
    }, limitMs - (now - lastCallTime));
  }) as T & { reset: () => void };

  (throttledFunc as any).reset = () => {
    lastCallTime = 0;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttledFunc;
}

/**
 * Debounce function calls
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delayMs: number
): T & { cancel: () => void } {
  let timeoutId: NodeJS.Timeout | null = null;

  const debouncedFunc = ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delayMs);
  }) as T & { cancel: () => void };

  (debouncedFunc as any).cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debouncedFunc;
}