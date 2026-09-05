const request = require('supertest');
const crypto = require('crypto');
const app = require('../app');
const User = require('../model/user');
const PasswordResetToken = require('../model/PasswordResetToken');
const emailService = require('../utils/emailService');
const { passwordResetLimiter, authLimiter } = require('../middleware/rateLimiter');
const { mockUser } = require('./helpers');

describe('Password Reset Flow API Security & Quality', () => {
  beforeEach(() => {
    if (passwordResetLimiter.reset) passwordResetLimiter.reset();
    if (authLimiter.reset) authLimiter.reset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });


  describe('POST /api/auth/forgot-password', () => {
    test('returns generic message, dispatches email, and invalidates previous tokens for existing user', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);
      const deleteManySpy = jest.spyOn(PasswordResetToken, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
      const createTokenSpy = jest.spyOn(PasswordResetToken, 'create').mockResolvedValue({
        userId: mockUser._id,
        tokenHash: 'somehash',
        expiresAt: new Date(Date.now() + 20 * 60 * 1000)
      });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: mockUser.email });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/if an account exists for this email, a password reset link has been sent/i);
      // Validates prior tokens for this user were invalidated before new one created
      expect(deleteManySpy).toHaveBeenCalledWith({ userId: mockUser._id });
      expect(createTokenSpy).toHaveBeenCalled();
      // Validates email service was called for existing account
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: mockUser.email,
          resetUrl: expect.stringMatching(/token=[a-f0-9]{64}/)
        })
      );
    });

    test('returns identical generic message for nonexistent email without calling email service or creating token', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      const createTokenSpy = jest.spyOn(PasswordResetToken, 'create');
      const emailSpy = jest.spyOn(emailService, 'sendPasswordResetEmail');

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'unknown.user@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/if an account exists for this email, a password reset link has been sent/i);
      // Ensure no database token created and no email sent
      expect(createTokenSpy).not.toHaveBeenCalled();
      expect(emailSpy).not.toHaveBeenCalled();
    });

    test('stores SHA-256 token hash in database and never the raw plaintext token', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(PasswordResetToken, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
      let savedRecord = null;
      jest.spyOn(PasswordResetToken, 'create').mockImplementation((data) => {
        savedRecord = data;
        return Promise.resolve(data);
      });

      let sentResetUrl = '';
      jest.spyOn(emailService, 'sendPasswordResetEmail').mockImplementation(({ resetUrl }) => {
        sentResetUrl = resetUrl;
        return Promise.resolve({ messageId: 'test-msg' });
      });

      await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: mockUser.email });

      expect(savedRecord).toBeDefined();
      expect(savedRecord.userId).toEqual(mockUser._id);
      expect(savedRecord.tokenHash).toHaveLength(64); // SHA-256 hex length
      expect(savedRecord.rawToken).toBeUndefined(); // Raw token never saved to DB

      // Verify that the hash in DB corresponds mathematically to the raw token sent in email
      const rawTokenFromEmail = new URL(sentResetUrl).searchParams.get('token');
      expect(rawTokenFromEmail).toBeDefined();
      const expectedHash = crypto.createHash('sha256').update(rawTokenFromEmail).digest('hex');
      expect(savedRecord.tokenHash).toBe(expectedHash);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    test('succeeds with valid token, updates password, and invalidates token against reuse', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      let tokensInDb = [
        {
          userId: mockUser._id,
          tokenHash,
          expiresAt: new Date(Date.now() + 20 * 60 * 1000)
        }
      ];

      jest.spyOn(PasswordResetToken, 'findOne').mockImplementation((query) => {
        const found = tokensInDb.find(t => {
          if (t.tokenHash !== query.tokenHash) return false;
          if (query.expiresAt && query.expiresAt.$gt) {
            return t.expiresAt > query.expiresAt.$gt;
          }
          return true;
        });
        return Promise.resolve(found || null);
      });

      jest.spyOn(PasswordResetToken, 'deleteMany').mockImplementation((query) => {
        tokensInDb = tokensInDb.filter(t => t.userId.toString() !== query.userId.toString());
        return Promise.resolve({ deletedCount: 1 });
      });

      const userUpdateMock = {
        ...mockUser,
        password: 'oldhash',
        save: jest.fn().mockResolvedValue(true)
      };
      jest.spyOn(User, 'findById').mockResolvedValue(userUpdateMock);

      // First reset attempt with valid token
      const res1 = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          password: 'NewSecurePassword123!'
        });

      expect(res1.status).toBe(200);
      expect(res1.body.success).toBe(true);
      expect(res1.body.message).toMatch(/password.*reset.*successfully/i);
      expect(userUpdateMock.save).toHaveBeenCalled();
      expect(tokensInDb).toHaveLength(0); // Token removed from DB

      // Verify that the password hash was genuinely changed and matches the new password
      const bcrypt = require('bcrypt');
      expect(userUpdateMock.password).not.toBe('oldhash');
      const isNewPasswordValid = await bcrypt.compare('NewSecurePassword123!', userUpdateMock.password);
      expect(isNewPasswordValid).toBe(true);
      const isOldPasswordValid = await bcrypt.compare('OldPassword123!', userUpdateMock.password);
      expect(isOldPasswordValid).toBe(false);


      // Replay attempt with same token must fail immediately
      const res2 = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          password: 'AnotherPassword123!'
        });

      expect(res2.status).toBe(400);
      expect(res2.body.success).toBe(false);
      expect(res2.body.message).toMatch(/invalid or expired/i);
    });

    test('enforces expiration predicate and rejects expired token with 400 Bad Request', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      // Token that expired 5 minutes ago
      const expiredTokensInDb = [
        {
          userId: mockUser._id,
          tokenHash,
          expiresAt: new Date(Date.now() - 5 * 60 * 1000)
        }
      ];

      jest.spyOn(PasswordResetToken, 'findOne').mockImplementation((query) => {
        const found = expiredTokensInDb.find(t => {
          if (t.tokenHash !== query.tokenHash) return false;
          if (query.expiresAt && query.expiresAt.$gt) {
            return t.expiresAt > query.expiresAt.$gt;
          }
          return true;
        });
        return Promise.resolve(found || null);
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: rawToken,
          password: 'NewPassword123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid or expired/i);
    });

    test('rejects tampered / modified token with 400 Bad Request', async () => {
      const genuineToken = crypto.randomBytes(32).toString('hex');
      const genuineHash = crypto.createHash('sha256').update(genuineToken).digest('hex');

      const tokensInDb = [
        {
          userId: mockUser._id,
          tokenHash: genuineHash,
          expiresAt: new Date(Date.now() + 20 * 60 * 1000)
        }
      ];

      jest.spyOn(PasswordResetToken, 'findOne').mockImplementation((query) => {
        const found = tokensInDb.find(t => t.tokenHash === query.tokenHash);
        return Promise.resolve(found || null);
      });

      // Tampered token (single character change)
      const tamperedToken = genuineToken.slice(0, -1) + (genuineToken.endsWith('a') ? 'b' : 'a');

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: tamperedToken,
          password: 'NewPassword123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid or expired/i);
    });

    test('rejects password shorter than 6 characters with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'somevalidlookingtoken1234567890',
          password: '123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/at least 6 characters/i);
    });
  });
});
