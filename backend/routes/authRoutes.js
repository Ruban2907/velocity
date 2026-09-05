const express = require('express');
const router = express.Router();
const {
  handleSignup,
  handleSignin,
  handleForgotPassword,
  handleResetPassword,
  handleLogout
} = require('../controllers/authController');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');

router.post('/signup', authLimiter, handleSignup);
router.post('/signin', authLimiter, handleSignin);
router.post('/forgot-password', passwordResetLimiter, handleForgotPassword);
router.post('/reset-password', passwordResetLimiter, handleResetPassword);
router.post('/logout', handleLogout);

module.exports = router;


