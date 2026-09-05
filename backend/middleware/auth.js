const { verifyToken } = require('../utils/jwt');
const User = require('../model/user');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        message: 'Authentication required. Please provide a valid token.' 
      });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found. Token is invalid.' 
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError' || error.name === 'SyntaxError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid or malformed authentication token.' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        message: 'Token has expired. Please log in again.' 
      });
    }
    console.error('[AUTH ERROR] Authentication middleware failure:', error.message);
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication failed. Please provide a valid token.' 
    });
  }
};


const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.'
    });
  }
};

module.exports = {
  authenticate,
  adminOnly,
};

