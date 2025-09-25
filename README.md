# express-async-super

🚀 **Intelligent global async error handling for Express.js** - Eliminate manual try/catch blocks from your async routes forever!

[![npm version](https://badge.fury.io/js/express-async-super.svg)](https://www.npmjs.com/package/express-async-super)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/nexus-aissam/express-async-super)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎯 Why express-async-super?

Traditional Express.js async error handling requires manual try/catch everywhere:

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
```

With **express-async-super**, just add one line:

```javascript
// ✅ After: Zero configuration, automatic error handling
app.use(asyncSuper.global());

app.get('/users', async (req, res) => {
  const users = await User.findAll(); // Errors automatically caught!
  res.json(users);
});
```

## 🚀 Quick Start

### Installation

```bash
npm install express-async-super
```

### Basic Usage

```javascript
const express = require('express');
const asyncSuper = require('express-async-super');

const app = express();

// Enable automatic async error handling
app.use(asyncSuper.global());

// All async routes now automatically handle errors
app.get('/users', async (req, res) => {
  const users = await getUsersFromDatabase(); // Any error automatically caught
  res.json(users);
});

// Add your error handler as usual
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});

app.listen(3000);
```

## 📚 API Documentation

### Global Configuration

```javascript
app.use(asyncSuper.global(options));
```

#### Available Options

```javascript
const options = {
  // Enable enhanced error logging
  errorLogging: true,              // Default: true
  
  // Enable performance monitoring
  performance: true,               // Default: false
  
  // Performance threshold in milliseconds
  performanceThreshold: 500,       // Default: 1000ms
  
  // Enable request correlation ID tracking  
  correlationId: true,            // Default: true
  
  // Enable error recovery suggestions
  recovery: true,                 // Default: false
  
  // Maximum error history per request
  maxErrorHistory: 5,             // Default: 10
  
  // Custom logger function
  logger: (message, level, context) => {
    console.log(`[${level}] ${message}`, context);
  },
  
  // Custom error handler
  errorHandler: (error, req, res, next) => {
    // Your custom error handling logic
    console.error('Enhanced error:', error);
    next(error);
  }
};

app.use(asyncSuper.global(options));
```

### Individual Route Wrapping

```javascript
// Wrap specific routes
app.get('/route', asyncSuper.wrap(async (req, res) => {
  // Your async code here
}));

// Wrap error handlers
app.use('/api', asyncSuper.wrapError(async (err, req, res, next) => {
  // Async error handling
  await logErrorToDatabase(err);
  res.status(500).json({ error: 'Internal server error' });
}));
```

### Utility Methods

```javascript
// Create request context manually
const context = asyncSuper.createContext(req);

// Enhance errors with context
const enhancedError = asyncSuper.enhanceError(originalError, req);

// Get performance metrics
const metrics = asyncSuper.getMetrics('/users'); // for specific route
const allMetrics = asyncSuper.getMetrics(); // for all routes

// Clear metrics
asyncSuper.clearMetrics();

// Check if function is async
const isAsync = asyncSuper.isAsyncFunction(myFunction);

// Get current configuration
const config = asyncSuper.getConfig();
```

## 🛠️ Features

### Enhanced Error Objects

Every caught error is automatically enhanced with:

```javascript
app.use((err, req, res, next) => {
  console.log(err);
  /*
  {
    message: 'User not found',
    originalError: Error('User not found'),
    routePath: '/users/123',
    method: 'GET', 
    correlationId: 'req-abc-123',
    timestamp: Date,
    duration: 45,
    suggestions: ['Check if user ID exists'],
    category: 'database',
    retryable: false
  }
  */
});
```

### Performance Monitoring

Track slow operations automatically:

```javascript
app.use(asyncSuper.global({
  performance: true,
  performanceThreshold: 200, // Log operations > 200ms
}));

// Get metrics
app.get('/metrics', (req, res) => {
  const metrics = asyncSuper.getMetrics();
  res.json(metrics);
});
```

### Request Context Tracking

Each request gets correlation ID and context:

```javascript
app.get('/test', async (req, res) => {
  console.log(req.correlationId); // Automatic correlation ID
  console.log(req.asyncContext);   // Request context object
  res.json({ success: true });
});
```

## 🎭 Examples

### Basic API Server

```javascript
const express = require('express');
const asyncSuper = require('express-async-super');

const app = express();

app.use(asyncSuper.global({
  errorLogging: true,
  performance: true,
  correlationId: true
}));

app.get('/users', async (req, res) => {
  const users = await User.findAll(); // Auto error handling
  res.json(users);
});

app.post('/users', async (req, res) => {
  const user = await User.create(req.body); // Auto error handling
  res.status(201).json(user);
});

app.get('/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id); // Auto error handling
  if (!user) {
    throw new Error('User not found'); // Automatically caught
  }
  res.json(user);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error details:', {
    message: err.message,
    route: err.routePath,
    correlationId: err.correlationId,
    duration: err.duration
  });
  
  res.status(500).json({ 
    error: 'Something went wrong',
    correlationId: err.correlationId 
  });
});

app.listen(3000);
```

### With Performance Monitoring

```javascript
const asyncSuper = require('express-async-super');

app.use(asyncSuper.global({
  performance: true,
  performanceThreshold: 100, // Log slow operations
  logger: (message, level, context) => {
    if (level === 'warn' && context?.isSlowOperation) {
      console.warn(`Slow operation detected: ${message}`, context);
    }
  }
}));

app.get('/slow-endpoint', async (req, res) => {
  await slowDatabaseQuery(); // Will be monitored
  res.json({ success: true });
});

app.get('/metrics', (req, res) => {
  const metrics = asyncSuper.getMetrics();
  res.json(metrics);
});
```

## 🔧 TypeScript Support

Full TypeScript support:

```typescript
import asyncSuper, { 
  GlobalAsyncSuperConfig, 
  EnhancedError,
  RequestContext 
} from 'express-async-super';

const config: GlobalAsyncSuperConfig = {
  errorLogging: true,
  performance: true,
  performanceThreshold: 100
};

app.use(asyncSuper.global(config));

app.get('/users/:id', async (req: Request, res: Response) => {
  const userId: string = req.params.id;
  const user = await User.findById(userId);
  res.json(user);
});
```

## 🚀 Migration from Other Libraries

### From express-async-handler

```javascript
// Before
const asyncHandler = require('express-async-handler');
app.get('/route', asyncHandler(async (req, res) => {
  // Your code
}));

// After  
const asyncSuper = require('express-async-super');
app.use(asyncSuper.global()); // One line for entire app
app.get('/route', async (req, res) => {
  // Same code, no wrapper needed
});
```

### From express-async-errors

```javascript
// Before
require('express-async-errors');

// After
const asyncSuper = require('express-async-super');
app.use(asyncSuper.global({
  performance: true,    // Added: Performance monitoring
  correlationId: true  // Added: Request correlation IDs
}));
```

## ❓ FAQ

### Q: Does this work with Express 4.x and 5.x?

**A:** Yes! Supports both Express 4.x and 5.x.

### Q: What's the performance overhead?

**A:** Minimal - less than 1ms per request for basic error handling.

### Q: Can I use it with existing error handlers?

**A:** Yes, it works seamlessly with your existing error middleware.

### Q: Does it work with TypeScript?

**A:** Yes, full TypeScript support with type definitions.

### Q: Can I disable certain features?

**A:** Yes, all features are configurable via the options object.

## 🤝 Contributing

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
- [Issues](https://github.com/nexus-aissam/express-async-super/issues)

---

⭐ **Star this repo** if express-async-super helps you build better Express applications!
