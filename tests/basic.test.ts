import request from 'supertest';
import express from 'express';
import asyncSuper from '../src/index';

describe('Express Async Super - Basic Functionality', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    
    // Setup async-super middleware
    app.use(asyncSuper.global({
      errorLogging: false, // Disable console logging in tests
      performance: true,
      recovery: true
    }));
  });

  afterEach(() => {
    // Clear metrics after each test
    asyncSuper.clearMetrics();
  });

  describe('Successful async operations', () => {
    it('should handle successful async route', async () => {
      app.get('/success', async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        res.json({ message: 'success', correlationId: (req as any).correlationId });
      });

      const response = await request(app)
        .get('/success')
        .expect(200);

      expect(response.body.message).toBe('success');
      expect(response.body.correlationId).toBeDefined();
      expect(typeof response.body.correlationId).toBe('string');
    });

    it('should provide correlation ID for tracking', async () => {
      app.get('/test', async (req, res) => {
        const correlationId = (req as any).correlationId;
        expect(correlationId).toBeDefined();
        expect(typeof correlationId).toBe('string');
        expect(correlationId.startsWith('async-')).toBe(true);
        res.json({ correlationId });
      });

      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.body.correlationId).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should catch and handle async errors', async () => {
      app.get('/error', async (req, res) => {
        throw new Error('Test async error');
      });

      const response = await request(app)
        .get('/error')
        .expect(500);

      expect(response.body.error).toBeDefined();
      expect(response.body.error.message).toBe('Test async error');
      expect(response.body.error.correlationId).toBeDefined();
    });

    it('should provide enhanced error information', async () => {
      app.get('/enhanced-error', async (req, res) => {
        const error = new Error('Enhanced test error');
        throw error;
      });

      const response = await request(app)
        .get('/enhanced-error')
        .expect(500);

      expect(response.body.error.message).toBe('Enhanced test error');
      expect(response.body.error.correlationId).toBeDefined();
      expect(response.body.error.timestamp).toBeDefined();
      expect(response.body.error.category).toBeDefined();
    });

    it('should handle validation errors with proper status codes', async () => {
      app.post('/validate', async (req, res) => {
        const { email } = req.body;
        
        if (!email || !email.includes('@')) {
          const error = new Error('Invalid email address') as any;
          error.statusCode = 400;
          throw error;
        }
        
        res.json({ message: 'Valid email' });
      });

      const response = await request(app)
        .post('/validate')
        .send({ email: 'invalid-email' })
        .expect(400);

      expect(response.body.error.message).toBe('Invalid email address');
    });
  });

  describe('Performance monitoring', () => {
    it('should track performance metrics for slow operations', async () => {
      app.get('/slow', async (req, res) => {
        // Operation slower than default threshold
        await new Promise(resolve => setTimeout(resolve, 600));
        res.json({ message: 'slow operation complete' });
      });

      await request(app)
        .get('/slow')
        .expect(200);

      const metrics = asyncSuper.getMetrics('/slow');
      expect(metrics.length).toBeGreaterThan(0);
      
      const metric = metrics[0];
      expect(metric).toBeDefined();
      if (metric) {
        expect(metric.duration).toBeGreaterThan(500);
        expect(metric.route).toContain('/slow');
        expect(metric.method).toBe('GET');
      }
    });

    it('should provide memory usage information', async () => {
      app.get('/memory', async (req, res) => {
        // Create some objects to use memory
        const data = Array.from({length: 1000}, (_, i) => ({ id: i, data: 'test'.repeat(100) }));
        await new Promise(resolve => setTimeout(resolve, 100));
        res.json({ count: data.length });
      });

      await request(app)
        .get('/memory')
        .expect(200);

      const metrics = asyncSuper.getMetrics('/memory');
      expect(metrics.length).toBeGreaterThan(0);
      
      const metric = metrics[0];
      expect(metric).toBeDefined();
      if (metric) {
        expect(metric.memoryBefore).toBeDefined();
        expect(metric.memoryAfter).toBeDefined();
      }
    });
  });

  describe('Manual wrapper usage', () => {
    it('should work with manually wrapped handlers', async () => {
      const wrappedHandler = asyncSuper.wrap(async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        res.json({ message: 'manually wrapped', correlationId: (req as any).correlationId });
      });

      app.get('/manual', wrappedHandler);

      const response = await request(app)
        .get('/manual')
        .expect(200);

      expect(response.body.message).toBe('manually wrapped');
      expect(response.body.correlationId).toBeDefined();
    });

    it('should handle errors in manually wrapped handlers', async () => {
      const wrappedHandler = asyncSuper.wrap(async (req, res) => {
        throw new Error('Manual wrapper error');
      });

      app.get('/manual-error', wrappedHandler);

      const response = await request(app)
        .get('/manual-error')
        .expect(500);

      expect(response.body.error.message).toBe('Manual wrapper error');
    });
  });

  describe('Utility functions', () => {
    it('should correctly identify async functions', () => {
      const asyncFn = async () => {};
      const syncFn = () => {};
      const asyncArrowFn = async () => {};

      expect(asyncSuper.isAsyncFunction(asyncFn)).toBe(true);
      expect(asyncSuper.isAsyncFunction(asyncArrowFn)).toBe(true);
      expect(asyncSuper.isAsyncFunction(syncFn)).toBe(false);
    });

    it('should provide configuration access', () => {
      const config = asyncSuper.getConfig();
      expect(config).toBeDefined();
      expect(config?.performance).toBe(true);
      expect(config?.recovery).toBe(true);
    });

    it('should allow metrics clearing', () => {
      // Add some metrics first
      app.get('/metrics-test', async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 100));
        res.json({ message: 'test' });
      });

      return request(app)
        .get('/metrics-test')
        .expect(200)
        .then(() => {
          const metricsBefore = asyncSuper.getMetrics();
          expect(metricsBefore.length).toBeGreaterThan(0);

          asyncSuper.clearMetrics();
          
          const metricsAfter = asyncSuper.getMetrics();
          expect(metricsAfter.length).toBe(0);
        });
    });
  });

  describe('Error categorization', () => {
    it('should categorize database errors', async () => {
      app.get('/db-error', async (req, res) => {
        const error = new Error('Database connection failed');
        (error as any).code = 'ECONNREFUSED';
        throw error;
      });

      const response = await request(app)
        .get('/db-error')
        .expect(500);

      expect(response.body.error.category).toBe('network');
    });

    it('should categorize validation errors', async () => {
      app.get('/validation-error', async (req, res) => {
        const error = new Error('Validation failed: email is required');
        throw error;
      });

      const response = await request(app)
        .get('/validation-error')
        .expect(500);

      expect(response.body.error.category).toBe('validation');
    });
  });

  describe('Error recovery', () => {
    it('should provide recovery suggestions', async () => {
      app.get('/network-error', async (req, res) => {
        const error = new Error('Network timeout occurred');
        (error as any).code = 'ETIMEDOUT';
        throw error;
      });

      const response = await request(app)
        .get('/network-error')
        .expect(500);

      expect(response.body.error.suggestions).toBeDefined();
      expect(Array.isArray(response.body.error.suggestions)).toBe(true);
      expect(response.body.error.suggestions.length).toBeGreaterThan(0);
    });

    it('should mark appropriate errors as retryable', async () => {
      app.get('/retryable-error', async (req, res) => {
        const error = new Error('Connection timeout');
        (error as any).code = 'ETIMEDOUT';
        throw error;
      });

      const response = await request(app)
        .get('/retryable-error')
        .expect(500);

      expect(response.body.error.retryable).toBe(true);
    });
  });
});