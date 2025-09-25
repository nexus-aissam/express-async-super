# API Reference - Express Async Super

Complete API documentation with examples for all methods, interfaces, and configuration options.

## Table of Contents

- [Main Interface](#main-interface)
- [Configuration Options](#configuration-options)
- [Error Types](#error-types)
- [Performance Monitoring](#performance-monitoring)
- [TypeScript Types](#typescript-types)
- [Utility Functions](#utility-functions)

## Main Interface

### `asyncSuper.global(config?)`

Configure global async error handling for your entire Express application.

**Parameters:**
- `config` *(optional)*: `GlobalAsyncSuperConfig` - Configuration options

**Returns:** Express middleware function

**Examples:**

```javascript
// Zero configuration - just works!
app.use(asyncSuper.global());

// Basic configuration
app.use(asyncSuper.global({
  errorLogging: true,
  performance: true,
  correlationId: true
}));

// Advanced configuration
app.use(asyncSuper.global({
  errorLogging: true,
  performance: true,
  performanceThreshold: 500, // Log operations > 500ms
  correlationId: true,
  maxErrorHistory: 5,
  
  // Custom error handler
  errorHandler: (error, req, res, next) => {
    console.log('Custom handling:', error.correlationId);
    // Log to monitoring service
    monitoring.logError(error);
    next(error);
  },
  
  // Custom logger
  logger: (message, level, context) => {
    winston.log(level, message, context);
  }
}));
```

---

### `asyncSuper.wrap(handler)`

Wrap individual async route handler with automatic error catching.

**Parameters:**
- `handler`: `AsyncRouteHandler` - Async route handler function

**Returns:** `WrappedRouteHandler` - Wrapped handler with error catching

**Examples:**

```javascript
// Wrap specific route
app.get('/users', asyncSuper.wrap(async (req, res) => {
  const users = await User.findAll();
  res.json(users);
}));

// Works with route parameters
app.get('/users/:id', asyncSuper.wrap(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new Error('User not found'); // Automatically caught
  }
  res.json(user);
}));

// POST with body validation
app.post('/users', asyncSuper.wrap(async (req, res) => {
  const user = await User.create(req.body);
  res.status(201).json(user);
}));
```

---

### `asyncSuper.wrapError(handler)`

Wrap async error handler middleware.

**Parameters:**
- `handler`: `AsyncErrorHandler` - Async error handler function

**Returns:** `WrappedErrorHandler` - Wrapped error handler

**Examples:**

```javascript
// Async error logging
app.use(asyncSuper.wrapError(async (err, req, res, next) => {
  await logErrorToDatabase(err);
  await notifyAdmins(err);
  res.status(500).json({ error: 'Internal server error' });
}));

// Conditional error handling
app.use('/api', asyncSuper.wrapError(async (err, req, res, next) => {
  if (err.category === 'VALIDATION') {
    return res.status(400).json({ error: err.message });
  }
  
  if (err.retryable) {
    await scheduleRetry(req);
  }
  
  next(err);
}));
```

---

### `asyncSuper.getMetrics(route?)`

Get performance metrics for monitoring and debugging.

**Parameters:**
- `route` *(optional)*: `string` - Route path to filter metrics

**Returns:** `PerformanceMetrics[]` - Array of performance metrics

**Examples:**

```javascript
// Get all metrics
app.get('/admin/metrics', (req, res) => {
  const metrics = asyncSuper.getMetrics();
  res.json({
    totalRequests: metrics.length,
    slowOperations: metrics.filter(m => m.isSlowOperation).length,
    averageDuration: metrics.reduce((sum, m) => sum + (m.duration || 0), 0) / metrics.length,
    metrics
  });
});

// Get metrics for specific route
app.get('/admin/metrics/users', (req, res) => {
  const userMetrics = asyncSuper.getMetrics('/users');
  res.json(userMetrics);
});

// Monitor slow operations
setInterval(() => {
  const metrics = asyncSuper.getMetrics();
  const slowOps = metrics.filter(m => m.isSlowOperation);
  
  if (slowOps.length > 0) {
    console.warn(`Found ${slowOps.length} slow operations:`, slowOps);
  }
}, 30000);
```

---

### `asyncSuper.clearMetrics()`

Clear all stored performance metrics.

**Examples:**

```javascript
// Clear metrics endpoint
app.delete('/admin/metrics', (req, res) => {
  asyncSuper.clearMetrics();
  res.json({ message: 'Metrics cleared successfully' });
});

// Periodic cleanup
setInterval(() => {
  asyncSuper.clearMetrics();
  console.log('Metrics cleared for memory management');
}, 3600000); // Every hour
```

---

### `asyncSuper.createContext(req)`

Create request context manually for tracking.

**Parameters:**
- `req`: `Request` - Express request object

**Returns:** `RequestContext` - Request context with correlation ID

**Examples:**

```javascript
// Custom middleware with context
app.use((req, res, next) => {
  req.customContext = asyncSuper.createContext(req);
  console.log('Request started:', req.customContext.correlationId);
  next();
});

// Debug endpoint
app.get('/debug/context', (req, res) => {
  const context = asyncSuper.createContext(req);
  res.json({
    correlationId: context.correlationId,
    startTime: context.startTime,
    metadata: context.metadata
  });
});
```

---

### `asyncSuper.enhanceError(error, req?, context?)`

Manually enhance error with debugging context.

**Parameters:**
- `error`: `Error` - Original error to enhance
- `req` *(optional)*: `Request` - Express request object
- `context` *(optional)*: `any` - Additional context data

**Returns:** `EnhancedError` - Enhanced error with debugging info

**Examples:**

```javascript
// Enhance errors in try/catch
app.get('/risky/:id', async (req, res) => {
  try {
    await riskyOperation(req.params.id);
    res.json({ success: true });
  } catch (error) {
    const enhanced = asyncSuper.enhanceError(error, req, {
      operation: 'riskyOperation',
      resourceId: req.params.id,
      userId: req.user?.id
    });
    throw enhanced; // Will be caught by global handler
  }
});

// Custom error enhancement
function enhanceValidationError(error, data) {
  return asyncSuper.enhanceError(error, null, {
    validationData: data,
    suggestions: ['Check required fields', 'Verify data types']
  });
}
```

---

### `asyncSuper.isAsyncFunction(fn)`

Check if a function is async (returns Promise).

**Parameters:**
- `fn`: `Function` - Function to check

**Returns:** `boolean` - True if function is async

**Examples:**

```javascript
// Dynamic handler wrapping
function smartWrap(handler) {
  if (asyncSuper.isAsyncFunction(handler)) {
    console.log('Wrapping async handler');
    return asyncSuper.wrap(handler);
  }
  console.log('Handler is synchronous');
  return handler;
}

// Route setup with mixed handlers
const handlers = [authMiddleware, asyncDataLoader, syncFormatter];

handlers.forEach((handler, index) => {
  if (asyncSuper.isAsyncFunction(handler)) {
    console.log(`Handler ${index} is async`);
    app.use(`/step${index}`, asyncSuper.wrap(handler));
  } else {
    console.log(`Handler ${index} is sync`);
    app.use(`/step${index}`, handler);
  }
});
```

---

### `asyncSuper.getConfig()`

Get current configuration for debugging and inspection.

**Returns:** `GlobalAsyncSuperConfig | null` - Current configuration or null

**Examples:**

```javascript
// Debug configuration endpoint
app.get('/debug/config', (req, res) => {
  const config = asyncSuper.getConfig();
  res.json({
    configured: config !== null,
    errorLogging: config?.errorLogging ?? false,
    performance: config?.performance ?? false,
    correlationId: config?.correlationId ?? false,
    performanceThreshold: config?.performanceThreshold ?? 1000
  });
});

// Conditional behavior based on config
function logSlowOperation(duration) {
  const config = asyncSuper.getConfig();
  const threshold = config?.performanceThreshold ?? 1000;
  
  if (duration > threshold) {
    console.warn(`Slow operation detected: ${duration}ms`);
  }
}
```

## Configuration Options

### `GlobalAsyncSuperConfig`

Complete configuration interface for customizing async error handling behavior.

```typescript
interface GlobalAsyncSuperConfig {
  errorLogging?: boolean;        // Default: true
  performance?: boolean;         // Default: false  
  recovery?: boolean;           // Default: false
  performanceThreshold?: number; // Default: 1000 (ms)
  maxErrorHistory?: number;     // Default: 10
  correlationId?: boolean;      // Default: true
  
  errorHandler?: (error, req, res, next) => void;
  logger?: (message, level, context) => void;
}
```

**Configuration Examples:**

```javascript
// Development configuration
const devConfig = {
  errorLogging: true,
  performance: true,
  performanceThreshold: 100, // Strict performance monitoring
  correlationId: true,
  logger: (message, level, context) => {
    console.log(`[DEV][${level.toUpperCase()}] ${message}`, context);
  }
};

// Production configuration
const prodConfig = {
  errorLogging: false, // Use custom handler instead
  performance: true,
  performanceThreshold: 500,
  correlationId: true,
  maxErrorHistory: 3,
  
  errorHandler: (error, req, res, next) => {
    // Log to monitoring service
    monitoring.logError({
      message: error.message,
      correlationId: error.correlationId,
      route: error.routePath,
      duration: error.duration,
      userAgent: req.get('user-agent'),
      ip: req.ip
    });
    next(error);
  },
  
  logger: (message, level, context) => {
    winston.log(level, message, context);
  }
};

// Choose config based on environment
const config = process.env.NODE_ENV === 'production' ? prodConfig : devConfig;
app.use(asyncSuper.global(config));
```

## Error Types

### `EnhancedError`

All caught errors are automatically enhanced with additional debugging context.

```typescript
interface EnhancedError extends Error {
  originalError?: Error;     // Original error before enhancement
  request?: Request;         // Express request object
  routePath?: string;        // Route path (e.g., '/users/:id')
  method?: string;          // HTTP method (GET, POST, etc.)
  correlationId?: string;   // Request correlation ID
  timestamp?: Date;         // When error occurred
  duration?: number;        // Operation duration (ms)
  suggestions?: string[];   // Recovery suggestions
  context?: any;           // Additional context data
  category?: ErrorCategory; // Error classification
  retryable?: boolean;     // Whether error is retryable
}
```

**Using Enhanced Errors:**

```javascript
app.use((err, req, res, next) => {
  // Enhanced error properties are available
  console.log('Error Details:', {
    message: err.message,
    correlationId: err.correlationId,
    route: `${err.method} ${err.routePath}`,
    duration: err.duration,
    category: err.category,
    retryable: err.retryable,
    suggestions: err.suggestions
  });
  
  // Response based on error category
  let status = 500;
  let message = 'Internal server error';
  
  switch (err.category) {
    case 'VALIDATION':
      status = 400;
      message = 'Invalid input data';
      break;
    case 'AUTHENTICATION':
      status = 401;
      message = 'Authentication required';
      break;
    case 'AUTHORIZATION':
      status = 403;
      message = 'Access denied';
      break;
    case 'DATABASE':
      status = 503;
      message = 'Service temporarily unavailable';
      break;
  }
  
  res.status(status).json({
    error: message,
    correlationId: err.correlationId,
    suggestions: err.suggestions
  });
});
```

### `ErrorCategory` Enum

Automatic error classification for appropriate handling.

```typescript
enum ErrorCategory {
  DATABASE = "database",         // DB connection, query errors
  NETWORK = "network",          // Network timeouts, API failures  
  VALIDATION = "validation",    // Input validation errors
  AUTHENTICATION = "authentication", // Login, token errors
  AUTHORIZATION = "authorization",   // Permission errors
  BUSINESS_LOGIC = "business_logic", // Domain logic errors
  SYSTEM = "system",            // File system, memory errors
  UNKNOWN = "unknown"           // Uncategorized errors
}
```

## Performance Monitoring

### `PerformanceMetrics`

Performance data collected when monitoring is enabled.

```typescript
interface PerformanceMetrics {
  startTime: number;           // Operation start time
  endTime?: number;           // Operation end time
  duration?: number;          // Duration in milliseconds
  memoryBefore?: NodeJS.MemoryUsage; // Memory before operation
  memoryAfter?: NodeJS.MemoryUsage;  // Memory after operation
  route?: string;             // Route path
  method?: string;           // HTTP method
  isSlowOperation?: boolean; // Exceeded threshold
}
```

**Performance Monitoring Examples:**

```javascript
// Enable performance monitoring
app.use(asyncSuper.global({
  performance: true,
  performanceThreshold: 300 // Flag operations > 300ms as slow
}));

// Performance dashboard
app.get('/performance', (req, res) => {
  const metrics = asyncSuper.getMetrics();
  
  const stats = {
    total: metrics.length,
    slow: metrics.filter(m => m.isSlowOperation).length,
    averageDuration: metrics.reduce((sum, m) => sum + (m.duration || 0), 0) / metrics.length,
    byRoute: {},
    slowestOperations: metrics
      .filter(m => m.duration)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)
  };
  
  // Group by route
  metrics.forEach(metric => {
    const route = `${metric.method} ${metric.route}`;
    if (!stats.byRoute[route]) {
      stats.byRoute[route] = { count: 0, totalDuration: 0, slowCount: 0 };
    }
    stats.byRoute[route].count++;
    stats.byRoute[route].totalDuration += metric.duration || 0;
    if (metric.isSlowOperation) {
      stats.byRoute[route].slowCount++;
    }
  });
  
  // Calculate averages
  Object.keys(stats.byRoute).forEach(route => {
    const routeStats = stats.byRoute[route];
    routeStats.averageDuration = routeStats.totalDuration / routeStats.count;
  });
  
  res.json(stats);
});
```

## Utility Functions

### `setupAsyncSuper(config)`

Convenience function for quick setup.

```javascript
import { setupAsyncSuper } from 'express-async-super';

// Equivalent to asyncSuper.global(config)
app.use(setupAsyncSuper({
  errorLogging: true,
  performance: true
}));
```

### `asyncHandler(handler)`

Functional style wrapper for individual routes.

```javascript
import { asyncHandler } from 'express-async-super';

const getUsers = asyncHandler(async (req, res) => {
  const users = await User.findAll();
  res.json(users);
});

app.get('/users', getUsers);
```

### `asyncErrorHandler(handler)`

Functional style wrapper for error handlers.

```javascript
import { asyncErrorHandler } from 'express-async-super';

const errorLogger = asyncErrorHandler(async (err, req, res, next) => {
  await logToDatabase(err);
  next(err);
});

app.use(errorLogger);
```

## Complete Working Examples

### Basic API Server

```javascript
const express = require('express');
const asyncSuper = require('express-async-super');

const app = express();
app.use(express.json());

// Enable global async error handling
app.use(asyncSuper.global({
  errorLogging: true,
  performance: true,
  correlationId: true
}));

// Routes with automatic error handling
app.get('/users', async (req, res) => {
  const users = await User.findAll(); // Errors automatically caught
  res.json(users);
});

app.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    throw new Error('User not found'); // Automatically caught and enhanced
  }
  res.json(user);
});

app.post('/users', async (req, res) => {
  const user = await User.create(req.body); // Validation errors caught
  res.status(201).json(user);
});

// Enhanced error handler
app.use((err, req, res, next) => {
  console.error('Request failed:', {
    correlationId: err.correlationId,
    route: err.routePath,
    method: err.method,
    duration: err.duration,
    message: err.message
  });
  
  res.status(500).json({
    error: 'Something went wrong',
    correlationId: err.correlationId
  });
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

### Advanced Monitoring Setup

```javascript
const express = require('express');
const asyncSuper = require('express-async-super');
const winston = require('winston');

const app = express();

// Advanced configuration
app.use(asyncSuper.global({
  errorLogging: false, // Use custom handler
  performance: true,
  performanceThreshold: 500,
  correlationId: true,
  maxErrorHistory: 5,
  
  // Custom error handler
  errorHandler: (error, req, res, next) => {
    // Log to monitoring service
    winston.error('Async error caught', {
      correlationId: error.correlationId,
      route: error.routePath,
      method: error.method,
      duration: error.duration,
      category: error.category,
      message: error.message,
      stack: error.stack
    });
    
    // Add to metrics
    if (error.duration > 1000) {
      winston.warn('Slow operation detected', {
        correlationId: error.correlationId,
        duration: error.duration
      });
    }
    
    next(error);
  },
  
  // Custom logger for internal messages
  logger: (message, level, context) => {
    winston.log(level, `[AsyncSuper] ${message}`, context);
  }
}));

// Performance monitoring endpoints
app.get('/metrics', (req, res) => {
  const metrics = asyncSuper.getMetrics();
  res.json({
    summary: {
      total: metrics.length,
      slow: metrics.filter(m => m.isSlowOperation).length,
      average: metrics.reduce((s, m) => s + (m.duration || 0), 0) / metrics.length
    },
    metrics: metrics.slice(-50) // Last 50 operations
  });
});

app.delete('/metrics', (req, res) => {
  asyncSuper.clearMetrics();
  res.json({ message: 'Metrics cleared' });
});

// Health check with configuration info
app.get('/health', (req, res) => {
  const config = asyncSuper.getConfig();
  res.json({
    status: 'healthy',
    asyncSuper: {
      configured: config !== null,
      performance: config?.performance,
      errorLogging: config?.errorLogging,
      threshold: config?.performanceThreshold
    }
  });
});

app.listen(3000);
```

This comprehensive API reference provides developers with everything they need to effectively use express-async-super, complete with real-world examples and best practices.