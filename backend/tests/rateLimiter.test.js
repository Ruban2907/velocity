const { createRateLimiter } = require('../middleware/rateLimiter');

describe('In-Memory Sliding Window Rate Limiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('allows requests below the limit and returns correct rate limit headers', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 3, message: 'Too many requests' });
    const next = jest.fn();
    const headers = {};
    const res = {
      setHeader: jest.fn((k, v) => { headers[k] = v; }),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const req1 = { ip: '10.0.0.1', headers: {}, socket: {} };
    limiter(req1, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(headers['X-RateLimit-Limit']).toBe(3);
    expect(headers['X-RateLimit-Remaining']).toBe(2);

    const req2 = { ip: '10.0.0.1', headers: {}, socket: {} };
    limiter(req2, res, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(headers['X-RateLimit-Remaining']).toBe(1);
  });

  test('rejects requests exceeding the limit with 429 and Retry-After', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 2, message: 'Too many requests' });
    const next = jest.fn();
    const headers = {};
    let responseBody = null;
    let statusCode = null;

    const res = {
      setHeader: jest.fn((k, v) => { headers[k] = v; }),
      status: jest.fn((code) => {
        statusCode = code;
        return {
          json: jest.fn((body) => { responseBody = body; })
        };
      }),
      json: jest.fn()
    };

    const req = { ip: '10.0.0.2', headers: {}, socket: {} };

    // Request 1: OK
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Request 2: OK
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    // Request 3: Blocked
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2); // next() not called
    expect(statusCode).toBe(429);
    expect(responseBody.success).toBe(false);
    expect(responseBody.message).toBe('Too many requests');
    expect(headers['Retry-After']).toBeGreaterThanOrEqual(1);
  });

  test('tracks separate IP addresses with independent counters', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 1, message: 'Rate limit hit' });
    const next = jest.fn();
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const reqA = { ip: '192.168.1.100', headers: {}, socket: {} };
    const reqB = { ip: '192.168.1.200', headers: {}, socket: {} };

    // IP A request 1
    limiter(reqA, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // IP B request 1 should still pass because it has its own bucket
    limiter(reqB, res, next);
    expect(next).toHaveBeenCalledTimes(2);

    // IP A request 2 should be rejected
    limiter(reqA, res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  test('resets counter after windowMs expires', () => {
    const limiter = createRateLimiter({ windowMs: 30000, max: 1, message: 'Limit hit' });
    const next = jest.fn();
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const req = { ip: '10.0.0.3', headers: {}, socket: {} };

    // Request 1: OK
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Advance clock past the window
    jest.advanceTimersByTime(31000);

    // Request after window should succeed again
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });

  test('verifies exact limit boundary (remaining reaches 0 before rejection)', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 2, message: 'Limit reached' });
    const next = jest.fn();
    const headers = {};
    const res = {
      setHeader: jest.fn((k, v) => { headers[k] = v; }),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const req = { ip: '10.0.0.4', headers: {}, socket: {} };

    // Request 1: remaining = 1
    limiter(req, res, next);
    expect(headers['X-RateLimit-Remaining']).toBe(1);

    // Request 2 (exact limit boundary): remaining = 0, still allowed
    limiter(req, res, next);
    expect(headers['X-RateLimit-Remaining']).toBe(0);
    expect(next).toHaveBeenCalledTimes(2);

    // Request 3: blocked
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2); // no increment
  });

  test('limiter.reset() immediately clears rate limit history', () => {
    const limiter = createRateLimiter({ windowMs: 60000, max: 1, message: 'Rate limit hit' });
    const next = jest.fn();
    const res = {
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    const req = { ip: '10.0.0.5', headers: {}, socket: {} };

    // Request 1: OK
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Request 2: Blocked
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    // Call .reset()
    limiter.reset();

    // Request 3: OK again immediately without waiting
    limiter(req, res, next);
    expect(next).toHaveBeenCalledTimes(2);
  });
});

