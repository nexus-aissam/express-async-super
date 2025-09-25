import express from 'express';
import asyncSuper from '../src/index';

// Create Express app
const app = express();

// Add JSON body parsing
app.use(express.json());

// Setup async-super with global configuration
app.use(asyncSuper.global({
  errorLogging: true,
  performance: true,
  recovery: true,
  performanceThreshold: 500, // Log operations slower than 500ms
  correlationId: true
}));

// Example 1: Async route that succeeds
app.get('/success', async (req, res) => {
  // Simulate some async work
  await new Promise(resolve => setTimeout(resolve, 100));
  
  res.json({
    message: 'Success!',
    correlationId: (req as any).correlationId,
    timestamp: new Date().toISOString()
  });
});

// Example 2: Async route that throws an error
app.get('/error', async (req, res) => {
  // Simulate some async work before error
  await new Promise(resolve => setTimeout(resolve, 50));
  
  // This will be automatically caught and handled
  throw new Error('Something went wrong in async route!');
});

// Example 3: Database simulation with retry logic
app.get('/database', async (req, res) => {
  // Simulate database operation that might fail
  const shouldFail = Math.random() < 0.3;
  
  if (shouldFail) {
    const error = new Error('Database connection timeout');
    (error as any).code = 'ETIMEDOUT';
    throw error;
  }
  
  // Simulate database query time
  await new Promise(resolve => setTimeout(resolve, 200));
  
  res.json({
    data: [
      { id: 1, name: 'John Doe' },
      { id: 2, name: 'Jane Smith' }
    ],
    correlationId: (req as any).correlationId
  });
});

// Example 4: Network request simulation
app.get('/network', async (req, res) => {
  // Simulate external API call
  const shouldFail = Math.random() < 0.4;
  
  if (shouldFail) {
    const error = new Error('Failed to fetch from external API');
    (error as any).code = 'ECONNREFUSED';
    throw error;
  }
  
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 800));
  
  res.json({
    externalData: {
      weather: 'sunny',
      temperature: 72
    },
    correlationId: (req as any).correlationId
  });
});

// Example 5: Validation error
app.post('/validate', async (req, res) => {
  const { email, age } = req.body;
  
  // Simulate async validation
  await new Promise(resolve => setTimeout(resolve, 50));
  
  if (!email || !email.includes('@')) {
    const error = new Error('Invalid email address');
    (error as any).statusCode = 400;
    throw error;
  }
  
  if (!age || age < 18) {
    const error = new Error('Age must be 18 or older');
    (error as any).statusCode = 400;
    throw error;
  }
  
  res.json({
    message: 'Validation passed',
    user: { email, age },
    correlationId: (req as any).correlationId
  });
});

// Example 6: Slow operation
app.get('/slow', async (req, res) => {
  // This will trigger performance monitoring
  await new Promise(resolve => setTimeout(resolve, 1200));
  
  res.json({
    message: 'This was a slow operation',
    duration: '1200ms',
    correlationId: (req as any).correlationId
  });
});

// Example 7: Using manual wrapper for specific handler
app.get('/manual-wrap', asyncSuper.wrap(async (req, res) => {
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // This handler is manually wrapped
  throw new Error('Manually wrapped async error');
}));

// Example 8: Multiple async operations in sequence
app.get('/sequence', async (req, res) => {
  // Multiple async operations
  const step1 = await new Promise(resolve => 
    setTimeout(() => resolve('Step 1 complete'), 100)
  );
  
  const step2 = await new Promise(resolve => 
    setTimeout(() => resolve('Step 2 complete'), 150)
  );
  
  // This might fail
  if (Math.random() < 0.2) {
    throw new Error('Failed during step 3');
  }
  
  const step3 = await new Promise(resolve => 
    setTimeout(() => resolve('Step 3 complete'), 75)
  );
  
  res.json({
    message: 'All steps completed',
    steps: [step1, step2, step3],
    correlationId: (req as any).correlationId
  });
});

// Example 9: Nested async operations
app.get('/nested', async (req, res) => {
  const processData = async (data: string) => {
    await new Promise(resolve => setTimeout(resolve, 50));
    
    if (data === 'bad-data') {
      throw new Error('Invalid data provided to nested function');
    }
    
    return `Processed: ${data}`;
  };
  
  const items = ['item1', 'item2', 'item3'];
  
  // Add bad data sometimes to trigger error
  if (Math.random() < 0.3) {
    items.push('bad-data');
  }
  
  const results = [];
  for (const item of items) {
    const result = await processData(item);
    results.push(result);
  }
  
  res.json({
    message: 'Nested operations completed',
    results,
    correlationId: (req as any).correlationId
  });
});

// Example 10: Performance metrics endpoint
app.get('/metrics', (req, res) => {
  const metrics = asyncSuper.getMetrics();
  
  res.json({
    message: 'Performance metrics',
    totalMetrics: metrics.length,
    slowOperations: metrics.filter(m => m.isSlowOperation),
    averageDuration: metrics.length > 0 
      ? Math.round(metrics.reduce((sum, m) => sum + (m.duration || 0), 0) / metrics.length)
      : 0,
    metrics: metrics.slice(0, 10), // Return last 10 for brevity
    correlationId: (req as any).correlationId
  });
});

// Clear metrics endpoint
app.delete('/metrics', (req, res) => {
  asyncSuper.clearMetrics();
  
  res.json({
    message: 'Metrics cleared',
    correlationId: (req as any).correlationId
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    correlationId: (req as any).correlationId
  });
});

// Global error handler (will catch any errors not handled by async-super)
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.log('Global error handler received:', error.message);
  
  // This should rarely be called since async-super handles most errors
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'This error was not handled by async-super',
      originalError: error.message,
      correlationId: (req as any).correlationId
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    correlationId: (req as any).correlationId
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n🚀 Express Async Super Example Server running on port ${PORT}`);
  console.log(`\nTry these endpoints:`);
  console.log(`  GET  http://localhost:${PORT}/success      - Successful async operation`);
  console.log(`  GET  http://localhost:${PORT}/error        - Async error handling`);
  console.log(`  GET  http://localhost:${PORT}/database     - Database error simulation`);
  console.log(`  GET  http://localhost:${PORT}/network      - Network error simulation`);
  console.log(`  POST http://localhost:${PORT}/validate     - Validation error (send {email, age})`);
  console.log(`  GET  http://localhost:${PORT}/slow         - Slow operation (triggers perf monitoring)`);
  console.log(`  GET  http://localhost:${PORT}/sequence     - Multiple async operations`);
  console.log(`  GET  http://localhost:${PORT}/nested       - Nested async operations`);
  console.log(`  GET  http://localhost:${PORT}/metrics      - View performance metrics`);
  console.log(`  DELETE http://localhost:${PORT}/metrics    - Clear metrics`);
  console.log(`  GET  http://localhost:${PORT}/health       - Health check`);
  console.log(`\n💡 All async errors are automatically caught and handled!`);
  console.log(`📊 Performance monitoring is enabled for operations > 500ms`);
  console.log(`🔗 Each request gets a correlation ID for tracking\n`);
});

export default app;