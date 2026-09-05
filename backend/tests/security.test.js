const request = require('supertest');
const app = require('../app');

describe('Security & Infrastructure Hardening Tests', () => {
  describe('CORS Configuration', () => {
    test('allows requests from configured frontend origin', async () => {
      const res = await request(app)
        .get('/')
        .set('Origin', 'http://localhost:5173');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    test('blocks requests from unauthorized foreign origin', async () => {
      const res = await request(app)
        .get('/')
        .set('Origin', 'https://malicious-attacker-site.com');

      // Supertest / Express CORS error triggers error handler
      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/not allowed by CORS/i);
    });
  });

  describe('Global Payload Size Protection', () => {
    test('oversized JSON payload returns structured JSON 413 instead of HTML', async () => {
      const oversizedPayload = {
        data: 'x'.repeat(3 * 1024 * 1024) // 3MB payload exceeds 2MB limit
      };

      const res = await request(app)
        .post('/api/auth/signup')
        .send(oversizedPayload);

      expect(res.status).toBe(413);
      expect(res.type).toMatch(/json/);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/exceeds the maximum allowed size limit/i);
    });
  });

  describe('Unauthenticated Surface Protection', () => {
    const protectedEndpoints = [
      { method: 'get', path: '/api/users/me' },
      { method: 'post', path: '/api/jobs', body: { job_title: ['Engineer'] } },
      { method: 'post', path: '/api/recruitment/search', body: { jobId: '123' } },
      { method: 'get', path: '/api/recruitment/candidates' },
      { method: 'post', path: '/api/resume/parse', body: {} },
      { method: 'get', path: '/api/admin/recruiters' },
      { method: 'get', path: '/api/email-templates' }
    ];

    test.each(protectedEndpoints)(
      '$method.toUpperCase() $path rejects unauthenticated request with 401',
      async ({ method, path, body }) => {
        const req = request(app)[method](path);
        if (body) req.send(body);
        const res = await req;

        expect(res.status).toBe(401);
        expect(res.body.success).toBe(false);
      }
    );
  });

  describe('JWT Production Configuration Guard', () => {
    test('throws fatal error in production mode if JWT_SECRET is missing or an insecure default', () => {
      const INSECURE_DEFAULTS = [
        'development-secret-key-change-in-production',
        'your-super-secret-jwt-key',
        'your-super-secret-jwt-key-dev-only',
        'replace_with_a_long_random_secret'
      ];

      for (const insecureSecret of INSECURE_DEFAULTS) {
        expect(() => {
          jest.isolateModules(() => {
            process.env.NODE_ENV = 'production';
            process.env.JWT_SECRET = insecureSecret;
            require('../utils/jwt');
          });
        }).toThrow(/FATAL: A secure, non-placeholder JWT_SECRET environment variable is required in production/i);
      }

      // Reset test environment
      process.env.NODE_ENV = 'test';
      process.env.JWT_SECRET = 'test-jwt-secret-key-12345678901234567890';
    });
  });

  describe('Error Sanitization & Information Leakage Prevention', () => {
    test('internal server errors return safe generic message and do not expose stack traces, paths, or database internals', async () => {
      const User = require('../model/user');
      jest.spyOn(User, 'findOne').mockRejectedValue(new Error('FATAL MongoNetworkError: failed to connect to server [cluster0.mongodb.net:27017]'));

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'user@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('An unexpected error occurred during signin.');
      expect(res.body.stack).toBeUndefined();
      expect(res.body.trace).toBeUndefined();
      expect(res.body.internal).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toMatch(/mongodb\.net/);
    });
  });

  describe('Health Check Endpoints', () => {
    test('GET /health returns 200 with healthy status, timestamp, and uptime', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(typeof res.body.timestamp).toBe('string');
      expect(typeof res.body.uptime).toBe('number');
    });

    test('GET /api/health returns 200 with healthy status, timestamp, and uptime', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
      expect(typeof res.body.timestamp).toBe('string');
      expect(typeof res.body.uptime).toBe('number');
    });

    test('GET /health/live returns 200 with live status, timestamp, and uptime', async () => {
      const res = await request(app).get('/health/live');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('live');
      expect(typeof res.body.timestamp).toBe('string');
      expect(typeof res.body.uptime).toBe('number');
    });

    test('GET /health reflects unready state (503) when database is disconnected in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const res = await request(app).get('/health');
        expect(res.status).toBe(503);
        expect(res.body.status).toBe('unhealthy');
        expect(res.body.database).toBe('disconnected');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

});
