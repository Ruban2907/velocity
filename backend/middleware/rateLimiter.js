/**
 * In-memory sliding window rate limiter middleware.
 * Zero external dependencies. Automatically cleans up expired IP entries.
 */
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 100, message = "Too many requests. Please try again later." } = {}) {
  const hits = new Map();

  // Periodic cleanup every 5 minutes to prevent memory leaks
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  
  if (interval.unref) {
    interval.unref(); // Allow Node process to exit cleanly
  }

  const middleware = (req, res, next) => {
    const forwarded = req.headers ? req.headers["x-forwarded-for"] : null;
    const ip = (forwarded ? String(forwarded).split(',')[0].trim() : null) || req.ip || req.socket?.remoteAddress || "unknown";
    const now = Date.now();

    let record = hits.get(ip);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      hits.set(ip, record);
    } else {
      record.count += 1;
    }

    const remaining = Math.max(0, max - record.count);
    const retrySecs = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", remaining);
    res.setHeader("X-RateLimit-Reset", Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader("Retry-After", retrySecs);
      return res.status(429).json({
        success: false,
        message,
      });
    }

    next();
  };

  middleware.reset = () => hits.clear();
  return middleware;
}

// Pre-configured limiters for high-risk endpoints
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: "Too many login/registration attempts. Please try again in 15 minutes."
});

const passwordResetLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: "Too many password reset requests. Please try again in 15 minutes."
});

const searchLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20,
  message: "Too many candidate sourcing requests. Please slow down."
});

const resumeLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  message: "Too many resume parsing requests. Please wait a few minutes before trying again."
});

module.exports = {
  createRateLimiter,
  authLimiter,
  passwordResetLimiter,
  searchLimiter,
  resumeLimiter,
};
