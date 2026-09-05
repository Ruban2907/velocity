const crypto = require('crypto');
const User = require('../model/user');
const PasswordResetToken = require('../model/PasswordResetToken');
const { hashPassword, comparePassword } = require('../utils/password');
const { generateToken } = require('../utils/jwt');
const { sendPasswordResetEmail } = require('../utils/emailService');

const signup = async (userData) => {
  const { firstname, lastname, companyname, email, password } = userData;

  const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  const hashedPassword = await hashPassword(password);

  const user = await User.create({
    firstname,
    lastname,
    companyname,
    email: email.toLowerCase().trim(),
    password: hashedPassword,
    role: 'user'
  });

  const userObject = user.toObject();
  delete userObject.password;
  return userObject;
};

const signin = async (email, password) => {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new Error('Invalid email or password');
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new Error('Invalid email or password');
  }

  const token = generateToken({
    userId: user._id.toString(),
    email: user.email,
    role: user.role
  });

  const userObject = user.toObject();
  delete userObject.password;
  return {
    user: userObject,
    token
  };
};

/**
 * Initiates a password reset request.
 * Generates a crypto-secure token, stores its SHA-256 hash, and sends an email.
 * Always returns a generic success message without leaking whether the email exists.
 */
const requestPasswordReset = async (email) => {
  const normalizedEmail = (email || '').toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail });

  if (user) {
    // Invalidate any previous reset tokens for this user
    await PasswordResetToken.deleteMany({ userId: user._id });

    // Generate cryptographically secure random token (NOT JWT)
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 20 * 60 * 1000); // 20 minutes

    await PasswordResetToken.create({
      userId: user._id,
      tokenHash,
      expiresAt
    });

    const frontendBaseUrl = (process.env.FRONTEND_URL
      ? process.env.FRONTEND_URL.split(',')[0].trim()
      : 'http://localhost:5173'
    ).replace(/\/$/, '');

    const resetUrl = `${frontendBaseUrl}/reset-password?token=${rawToken}`;

    // Send email via configured transporter (fails gracefully if SMTP is not configured)
    await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
      firstname: user.firstname
    });
  }

  return {
    success: true,
    message: 'If an account exists for this email, a password reset link has been sent.'
  };
};

/**
 * Validates the reset token hash and updates the user password.
 * Invalidates token upon successful reset to prevent reuse.
 */
const resetPasswordWithToken = async (rawToken, newPassword) => {
  if (!rawToken || typeof rawToken !== 'string') {
    const error = new Error('Invalid or missing password reset token.');
    error.statusCode = 400;
    throw error;
  }

  if (!newPassword || newPassword.length < 6) {
    const error = new Error('Password must be at least 6 characters long.');
    error.statusCode = 400;
    throw error;
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');

  const tokenRecord = await PasswordResetToken.findOne({
    tokenHash,
    expiresAt: { $gt: new Date() }
  });

  if (!tokenRecord) {
    const error = new Error('Invalid or expired password reset token.');
    error.statusCode = 400;
    throw error;
  }

  const user = await User.findById(tokenRecord.userId);
  if (!user) {
    const error = new Error('User account associated with this token no longer exists.');
    error.statusCode = 400;
    throw error;
  }

  user.password = await hashPassword(newPassword);
  await user.save();

  // Invalidate all tokens for this user immediately
  await PasswordResetToken.deleteMany({ userId: user._id });

  return {
    success: true,
    message: 'Password has been reset successfully. Please sign in with your new password.'
  };
};

module.exports = {
  signup,
  signin,
  requestPasswordReset,
  resetPasswordWithToken
};


