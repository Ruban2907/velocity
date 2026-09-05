const { logActivity } = require("../utils/activityLogger");

/**
 * Middleware for automatic activity tracking
 * Filters routes and methods to create meaningful behavior logs
 */
const trackActivity = async (req, res, next) => {
  // We hook into the finish event of the response to ensure success or capture status
  res.on('finish', () => {
    // Basic skip rules (from prompt)
    const skipRoutes = ['/auth', '/static', '/assets', '/favicon.ico'];
    if (skipRoutes.some(route => req.originalUrl.includes(route))) return;
    
    // Only track authenticated requests with a user object
    if (!req.user || !req.user._id) return;
    
    // Map HTTP methods to logical actions
    const methodActions = {
      'GET': 'READ',
      'POST': 'CREATE',
      'PUT': 'UPDATE',
      'PATCH': 'UPDATE',
      'DELETE': 'DELETE'
    };
    const action = methodActions[req.method] || req.method;
    
    // Derive feature from the first segment of the route
    const urlParts = req.originalUrl.split('?')[0].split('/');
    // e.g. /api/recruitment/jobs -> recruitment
    // e.g. /admin/users -> admin
    const feature = urlParts[2] || urlParts[1] || 'root';
    
    const isSensitiveKey = (k) => {
      const lower = String(k || '').toLowerCase();
      return (
        lower.includes('token') ||
        lower.includes('password') ||
        lower.includes('pass') ||
        lower.includes('secret') ||
        lower.includes('auth') ||
        lower.includes('key') ||
        lower.includes('cookie')
      );
    };

    const sanitizeMetadataObj = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      const out = {};
      for (const [k, v] of Object.entries(obj)) {
        if (isSensitiveKey(k)) {
          out[k] = '[REDACTED]';
        } else if (v && typeof v === 'object') {
          out[k] = sanitizeMetadataObj(v);
        } else {
          out[k] = v;
        }
      }
      return out;
    };

    // Perform async logging without blocking the response
    logActivity({
      userId: req.user._id,
      feature: feature.toLowerCase(),
      action: `${action}_${req.method}`,
      metadata: {
        path: req.originalUrl,
        statusCode: res.statusCode,
        method: req.method,
        // We avoid logging sensitive query/params and large request bodies
        params: sanitizeMetadataObj(req.params),
        query: sanitizeMetadataObj(req.query),
      },
      ip: req.ip || req.headers['x-forwarded-for'],
      userAgent: req.headers['user-agent']
    });

  });

  next();
};

module.exports = { trackActivity };
