const authService = require('../services/authService');

const handleSignup = async (req, res) => {
  try {
    const { firstname, lastname, companyname, email, password } = req.body;

    if (!firstname || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide firstname, email, and password'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const user = await authService.signup({
      firstname,
      lastname,
      companyname,
      email,
      password
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: user
    });
  } catch (error) {
    console.error('Signup error:', error.message);
    
    if (error.message === 'User with this email already exists') {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }
    
    if (error.name === 'MongoServerError' || error.name === 'MongoNetworkError') {
      return res.status(503).json({
        success: false,
        message: 'Database service unavailable. Please try again later.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during signup.'
    });
  }
};

const handleSignin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const { user, token } = await authService.signin(email, password);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user,
        token
      }
    });
  } catch (error) {
    if (error.message === 'Invalid email or password') {
      return res.status(401).json({
        success: false,
        message: error.message
      });
    }
    console.error('Signin error:', error.message);
    res.status(500).json({
      success: false,
      message: 'An unexpected error occurred during signin.'
    });
  }
};


const handleForgotPassword = async (req, res) => {
  try {
    const { email } = req.body || {};

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email address'
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address'
      });
    }

    const result = await authService.requestPasswordReset(email);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Forgot password error:', error.message);
    // Generic message to prevent enumeration or implementation leakage
    return res.status(200).json({
      success: true,
      message: 'If an account exists for this email, a password reset link has been sent.'
    });
  }
};

const handleResetPassword = async (req, res) => {
  try {
    const { token, password } = req.body || {};

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'A valid password reset token is required'
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const result = await authService.resetPasswordWithToken(token, password);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Password reset error:', error.message);
    const statusCode = error.statusCode || 400;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Unable to reset password. The link may be invalid or expired.'
    });
  }
};

const handleLogout = async (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
    });

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error during logout'
    });
  }
};

module.exports = {
  handleSignup,
  handleSignin,
  handleForgotPassword,
  handleResetPassword,
  handleLogout
};


