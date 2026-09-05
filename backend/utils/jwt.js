const jwt = require('jsonwebtoken');

const isProduction = process.env.NODE_ENV === 'production';
const INSECURE_DEFAULTS = [
  'development-secret-key-change-in-production',
  'your-super-secret-jwt-key',
  'your-super-secret-jwt-key-dev-only',
  'replace_with_a_long_random_secret'
];

if (isProduction) {
  if (!process.env.JWT_SECRET || INSECURE_DEFAULTS.includes(process.env.JWT_SECRET.trim())) {
    throw new Error('FATAL: A secure, non-placeholder JWT_SECRET environment variable is required in production.');
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-local-secret-do-not-use-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (!isProduction && (!process.env.JWT_SECRET || INSECURE_DEFAULTS.includes(process.env.JWT_SECRET.trim()))) {
  console.warn('[SECURITY WARNING] Using default/placeholder JWT_SECRET. Set a strong secret in .env before deploying to production.');
}


const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
};

const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

module.exports = {
  generateToken,
  verifyToken
};

