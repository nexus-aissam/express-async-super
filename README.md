# express-async-super

🚀 **Intelligent global async error handling for Express.js** - Eliminate manual try/catch blocks from your async routes forever!

[![npm version](https://badge.fury.io/js/express-async-super.svg)](https://www.npmjs.com/package/express-async-super)
[![Build Status](https://github.com/nexus-aissam/express-async-super/workflows/CI/badge.svg)](https://github.com/nexus-aissam/express-async-super/actions)
[![Coverage Status](https://coveralls.io/repos/github/nexus-aissam/express-async-super/badge.svg)](https://coveralls.io/github/nexus-aissam/express-async-super)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎯 Why express-async-super?

Traditional Express.js async error handling is **painful**:

```javascript
// ❌ Before: Manual try/catch everywhere
app.get('/users', async (req, res, next) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (error) {
    next(error);
  }
});

app.post('/users', async (req, res, next) => {
  try {
    const user = await User.create(req.body);
    res.json(user);
  } catch (error) {
    next(error);
  }
});
```

With **express-async-super**, just add one line and forget about error handling:

```javascript
// ✅ After: Zero configuration, automatic error handling
app.use(asyncSuper.global());

app.get('/users', async (req, res) => {
  const users = await User.findAll(); // Errors automatically caught!
  res.json(users);
});

app.post('/users', async (req, res) => {
  const user = await User.create(req.body); // No more try/catch!
  res.json(user);
});
```

## 🚀 Quick Start

### Installation

```bash
npm install express-async-super
```

### Basic Usage (Zero Configuration)

```javascript
const express = require('express');
const asyncSuper = require('express-async-super');

const app = express();

// 🎯 ONE LINE TO RULE THEM ALL
app.use(asyncSuper.global());

// ✨ All async routes now automatically handle errors
app.get('/users', async (req, res) => {
  const users = await getUsersFromDatabase(); // Any error automatically caught
  res.json(users);
});

app.get('/user/:id', async (req, res) => {
  const user = await User.findById(req.params.id); // Throws if not found
  res.json(user);
});

// Add your error handler as usual
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});

app.listen(3000);
```

That's it! Every async route handler is now protected.

## 📚 Complete API Documentation

### Global Middleware (Recommended)

Apply automatic async error handling to your entire Express application:

```javascript
app.use(asyncSuper.global(options));
```

#### Options Object

```javascript
const options = {
  // Error logging and monitoring
  errorLogging: true,              // Enable enhanced error logging
  logFunction: console.error,      // Custom logging function
  
  // Performance monitoring
  performance: {
    enabled: true,                 // Enable performance tracking
    slowQueryThreshold: 100,       // Log slow operations (ms)
    memoryTracking: true          // Track memory usage
  },
  
  // Error recovery mechanisms
  recovery: {
    autoRetry: {
      enabled: true,
      maxRetries: 3,
      backoff: 'exponential',      // 'linear' or 'exponential'
      retryableErrors: ['DatabaseError', 'NetworkError']
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,         // Failures before opening circuit
      resetTimeout: 30000          // Time before trying again (ms)
    }
  },
  
  // Custom error handling
  errorTypes: {
    ValidationError: { 
      status: 400, 
      message: 'Invalid input data',
      recovery: 'user-input' 
    },
    DatabaseError: { 
      status: 503, 
      message: 'Database temporarily unavailable',
      recovery: 'retry' 
    },
    AuthenticationError: { 
      status: 401, 
      message: 'Authentication required' 
    }
  },
  
  // Request context enhancement
  contextTracking: {
    enabled: true,
    includeHeaders: ['user-agent', 'authorization'],
    includeBody: false,            // Don't log request body for security
    correlationId: true            // Add correlation IDs
  }
};

app.use(asyncSuper.global(options));
```

### Individual Route Wrapper

For fine-grained control, wrap individual routes:

```javascript
app.get('/route', asyncSuper.wrap(async (req, res) => {
  // Your async code here
}));

// With custom options for this route
app.get('/special', asyncSuper.wrap(async (req, res) => {
  // Custom handling for this specific route
}, {
  retry: { maxRetries: 5 },
  timeout: 10000
}));
```

### Router-Level Usage

Apply to specific Express routers:

```javascript
const router = express.Router();
router.use(asyncSuper.router({
  performance: { enabled: false },  // Disable performance tracking for this router
  errorTypes: {
    APIError: { status: 422 }
  }
}));

app.use('/api', router);
```

## 🛠️ Advanced Features

### Performance Monitoring

Track and optimize your async operations:

```javascript
app.use(asyncSuper.global({
  performance: {
    enabled: true,
    slowQueryThreshold: 50,        // Alert on operations > 50ms
    memoryTracking: true,
    onSlowOperation: (context) => {
      console.log(`Slow operation detected:`, {
        route: context.route,
        duration: context.duration,
        memory: context.memoryUsage
      });
    }
  }
}));
```

### Custom Error Enhancement

Automatically enhance errors with request context:

```javascript
app.use(asyncSuper.global({
  contextTracking: {
    enabled: true,
    enhanceError: (error, context) => {
      error.requestId = context.correlationId;
      error.userAgent = context.headers['user-agent'];
      error.timestamp = new Date().toISOString();
      error.route = `${context.method} ${context.path}`;
      return error;
    }
  }
}));
```

### Circuit Breaker Pattern

Prevent cascade failures with automatic circuit breaking:

```javascript
app.use(asyncSuper.global({
  recovery: {
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,         // Open circuit after 5 failures
      resetTimeout: 30000,         // Try again after 30 seconds
      onCircuitOpen: (service) => {
        console.log(`Circuit breaker opened for ${service}`);
      },
      fallbackResponse: {
        status: 503,
        body: { error: 'Service temporarily unavailable' }
      }
    }
  }
}));
```

### Automatic Retry Logic

Smart retry mechanisms for transient failures:

```javascript
app.use(asyncSuper.global({
  recovery: {
    autoRetry: {
      enabled: true,
      maxRetries: 3,
      backoff: 'exponential',      // 100ms, 400ms, 1600ms
      retryableErrors: [
        'DatabaseConnectionError',
        'TimeoutError',
        'NetworkError'
      ],
      onRetry: (error, attempt, context) => {
        console.log(`Retry attempt ${attempt} for ${context.route}`);
      }
    }
  }
}));
```

## 🎭 Real-World Examples

### E-commerce API

```javascript
const express = require('express');
const asyncSuper = require('express-async-super');

const app = express();

// Configure for e-commerce needs
app.use(asyncSuper.global({
  errorLogging: true,
  performance: {
    enabled: true,
    slowQueryThreshold: 200,       // E-commerce needs fast responses
  },
  recovery: {
    autoRetry: {
      enabled: true,
      maxRetries: 2,               // Quick retries for payment processing
      retryableErrors: ['PaymentGatewayError', 'InventoryServiceError']
    }
  },
  errorTypes: {
    InsufficientStock: { 
      status: 409, 
      message: 'Product out of stock' 
    },
    PaymentDeclined: { 
      status: 402, 
      message: 'Payment could not be processed' 
    },
    InvalidCoupon: { 
      status: 400, 
      message: 'Invalid or expired coupon code' 
    }
  }
}));

// Product catalog
app.get('/products', async (req, res) => {
  const products = await Product.findAll({
    where: { active: true },
    include: ['category', 'reviews']
  });
  res.json(products);
});

// Add to cart
app.post('/cart/:userId/items', async (req, res) => {
  const { productId, quantity } = req.body;
  
  // Check inventory (might throw InsufficientStock)
  await InventoryService.checkAvailability(productId, quantity);
  
  // Add to cart (might throw DatabaseError - will auto-retry)
  const cartItem = await CartService.addItem(req.params.userId, {
    productId,
    quantity
  });
  
  res.status(201).json(cartItem);
});

// Process payment
app.post('/orders/:orderId/payment', async (req, res) => {
  const { paymentMethod, amount } = req.body;
  
  // Process payment (might throw PaymentDeclined or PaymentGatewayError)
  const payment = await PaymentService.processPayment({
    orderId: req.params.orderId,
    method: paymentMethod,
    amount
  });
  
  // Send confirmation email (errors logged but don't fail request)
  EmailService.sendPaymentConfirmation(payment).catch(console.error);
  
  res.json({ success: true, transactionId: payment.id });
});

app.listen(3000);
```

### Microservice Integration

```javascript
const express = require('express');
const asyncSuper = require('express-async-super');

const app = express();

// Configure for microservice architecture
app.use(asyncSuper.global({
  contextTracking: {
    enabled: true,
    correlationId: true,           // Essential for distributed tracing
    includeHeaders: ['x-correlation-id', 'authorization']
  },
  recovery: {
    circuitBreaker: {
      enabled: true,
      failureThreshold: 3,         // Fail fast in microservices
      resetTimeout: 15000
    },
    autoRetry: {
      enabled: true,
      maxRetries: 2,
      backoff: 'linear'
    }
  },
  performance: {
    enabled: true,
    slowQueryThreshold: 100,
    onSlowOperation: (context) => {
      // Report to monitoring service
      MonitoringService.reportSlowOperation(context);
    }
  }
}));

// User service integration
app.get('/users/:id', async (req, res) => {
  const [user, permissions, preferences] = await Promise.all([
    UserService.getUser(req.params.id),      // Might fail and retry
    AuthService.getPermissions(req.params.id), // Circuit breaker protected
    PreferenceService.getPreferences(req.params.id) // Performance monitored
  ]);
  
  res.json({ user, permissions, preferences });
});

// Aggregate data from multiple services
app.get('/dashboard/:userId', async (req, res) => {
  const userId = req.params.userId;
  
  // Fan out to multiple services (all protected by circuit breakers)
  const dashboard = await Promise.all([
    UserService.getProfile(userId),
    OrderService.getRecentOrders(userId),
    RecommendationService.getRecommendations(userId),
    NotificationService.getUnreadCount(userId)
  ]).then(([profile, orders, recommendations, notifications]) => ({
    profile,
    recentOrders: orders.slice(0, 5),
    recommendations: recommendations.slice(0, 10),
    unreadNotifications: notifications
  }));
  
  res.json(dashboard);
});

app.listen(3000);
```

### Database-Heavy Application

```javascript
const express = require('express');
const asyncSuper = require('express-async-super');

const app = express();

// Configure for database-intensive operations
app.use(asyncSuper.global({
  performance: {
    enabled: true,
    slowQueryThreshold: 500,       // Database queries can be slower
    memoryTracking: true,
    onSlowOperation: (context) => {
      if (context.duration > 2000) {
        console.warn(`Very slow database operation: ${context.duration}ms`);
      }
    }
  },
  recovery: {
    autoRetry: {
      enabled: true,
      maxRetries: 3,
      backoff: 'exponential',
      retryableErrors: [
        'ConnectionTimeoutError',
        'DeadlockError',
        'ConnectionPoolError'
      ]
    }
  },
  errorTypes: {
    UniqueConstraintError: { 
      status: 409, 
      message: 'Resource already exists' 
    },
    ForeignKeyConstraintError: { 
      status: 400, 
      message: 'Invalid reference to related resource' 
    }
  }
}));

// Complex query with joins
app.get('/reports/sales', async (req, res) => {
  const { startDate, endDate, groupBy } = req.query;
  
  const salesReport = await db.query(`
    SELECT 
      ${groupBy === 'month' ? 'MONTH(created_at)' : 'DATE(created_at)'} as period,
      COUNT(*) as total_orders,
      SUM(total_amount) as total_revenue,
      AVG(total_amount) as avg_order_value
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN products p ON oi.product_id = p.id
    WHERE o.created_at BETWEEN ? AND ?
    AND o.status = 'completed'
    GROUP BY period
    ORDER BY period DESC
  `, [startDate, endDate]);
  
  res.json(salesReport);
});

// Batch operations
app.post('/products/bulk-update', async (req, res) => {
  const { updates } = req.body; // Array of product updates
  
  // Process in transaction (might deadlock and retry)
  const result = await db.transaction(async (trx) => {
    const updatedProducts = [];
    
    for (const update of updates) {
      const product = await Product.query(trx)
        .findById(update.id)
        .patch(update.data);
      updatedProducts.push(product);
    }
    
    return updatedProducts;
  });
  
  res.json({ updated: result.length });
});

app.listen(3000);
```

## 🔧 Migration Guide

### From express-async-handler

```javascript
// ❌ Before: express-async-handler
const asyncHandler = require('express-async-handler');

app.get('/route', asyncHandler(async (req, res) => {
  // Your code
}));
```

```javascript
// ✅ After: express-async-super (global)
const asyncSuper = require('express-async-super');

app.use(asyncSuper.global()); // One line for entire app

app.get('/route', async (req, res) => {
  // Same code, no wrapper needed
});
```

### From express-async-errors

```javascript
// ❌ Before: express-async-errors
require('express-async-errors');

app.get('/route', async (req, res) => {
  // Basic error handling only
});
```

```javascript
// ✅ After: express-async-super
const asyncSuper = require('express-async-super');

app.use(asyncSuper.global({
  performance: true,      // Added: Performance monitoring
  recovery: true,         // Added: Automatic retry logic
  errorLogging: true      // Added: Enhanced error logging
}));

app.get('/route', async (req, res) => {
  // Same code + enhanced features
});
```

### From Manual try/catch

```javascript
// ❌ Before: Manual error handling
app.get('/users', async (req, res, next) => {
  try {
    const users = await User.findAll();
    res.json(users);
  } catch (error) {
    next(error);
  }
});
```

```javascript
// ✅ After: Automatic handling
app.use(asyncSuper.global());

app.get('/users', async (req, res) => {
  const users = await User.findAll(); // Automatically caught
  res.json(users);
});
```

## 🎯 TypeScript Support

Full TypeScript support with enhanced type safety:

```typescript
import asyncSuper, { GlobalOptions, RequestContext, EnhancedError } from 'express-async-super';

// Typed configuration
const options: GlobalOptions = {
  errorLogging: true,
  performance: {
    enabled: true,
    slowQueryThreshold: 100
  }
};

app.use(asyncSuper.global(options));

// Enhanced request/response types
app.get('/users/:id', async (req: Request, res: Response) => {
  const userId: string = req.params.id;
  const user = await User.findById(userId);
  res.json(user);
});

// Custom error types
interface CustomError extends EnhancedError {
  code: 'VALIDATION_ERROR' | 'DATABASE_ERROR';
  context: RequestContext;
}
```

## 🚀 Performance

Benchmark comparison with popular alternatives:

| Library | Overhead | Memory | Features |
|---------|----------|---------|----------|
| express-async-super | **<1ms** | **Low** | ✅ Global, Performance, Recovery |
| express-async-handler | ~0.5ms | Low | ❌ Manual wrapping only |
| express-async-errors | ~0.3ms | Low | ❌ Basic error catching only |
| Manual try/catch | 0ms | None | ❌ No automation, verbose |

**express-async-super** provides maximum features with minimal performance impact.

## 🔍 Debugging and Monitoring

### Enhanced Error Objects

Every error is automatically enhanced with context:

```javascript
app.use((err, req, res, next) => {
  console.log(err);
  /*
  EnhancedError {
    message: 'User not found',
    status: 404,
    requestContext: {
      correlationId: 'req-123-456',
      method: 'GET',
      path: '/users/999',
      timestamp: '2023-12-01T12:00:00.000Z',
      userAgent: 'Mozilla/5.0...',
      duration: 45
    },
    originalError: Error('User not found'),
    suggestions: ['Check if user ID exists', 'Verify database connection']
  }
  */
});
```

### Performance Insights

```javascript
app.use(asyncSuper.global({
  performance: {
    enabled: true,
    onSlowOperation: (context) => {
      // Send to monitoring service
      Monitoring.track('slow-operation', {
        route: context.route,
        duration: context.duration,
        memoryUsage: context.memoryUsage
      });
    }
  }
}));
```

## 🛡️ Security Considerations

**express-async-super** follows security best practices:

- ✅ Never logs sensitive request data by default
- ✅ Configurable data sanitization
- ✅ No exposure of internal error details to clients
- ✅ Memory leak prevention
- ✅ Request timeout protection

```javascript
app.use(asyncSuper.global({
  contextTracking: {
    sanitizeHeaders: ['authorization', 'cookie'],
    sanitizeBody: true,           // Remove sensitive data from logs
    maxBodySize: 1024            // Limit logged body size
  }
}));
```

## ❓ FAQ

### Q: Does this work with Express 5.x?
**A:** Yes! express-async-super supports both Express 4.x and 5.x.

### Q: What's the performance impact?
**A:** Minimal (<1ms overhead per request). The global patching is highly optimized.

### Q: Can I use this with existing error handlers?
**A:** Absolutely! It works with your existing error handling middleware.

### Q: Does it work with TypeScript?
**A:** Yes, full TypeScript support with enhanced type definitions.

### Q: What about memory leaks?
**A:** Built-in memory leak prevention and automatic cleanup of tracking data.

### Q: Can I disable features I don't need?
**A:** Yes, everything is configurable. Use only what you need.

### Q: How do I handle specific error types?
**A:** Configure custom error types in the options with specific status codes and messages.

### Q: Does it work with clustering/PM2?
**A:** Yes, each worker process handles its own async operations independently.

### Q: What about existing middleware?
**A:** It works seamlessly with all existing Express middleware.

### Q: How do I test my routes?
**A:** Test normally with supertest or similar - the wrapper is transparent.

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

MIT © [Nexus Aissam](https://github.com/nexus-aissam)

## 🔗 Links

- [GitHub Repository](https://github.com/nexus-aissam/express-async-super)
- [NPM Package](https://www.npmjs.com/package/express-async-super)
- [Documentation](https://github.com/nexus-aissam/express-async-super#readme)
- [Issues](https://github.com/nexus-aissam/express-async-super/issues)
- [Changelog](https://github.com/nexus-aissam/express-async-super/blob/main/CHANGELOG.md)

---

⭐ **Star this repo** if express-async-super helps you write better Express applications!

Made with ❤️ for the Express.js community