const request = require('supertest');
const app = require('../app');
const User = require('../model/user');
const jwt = require('jsonwebtoken');
const { mockUser, mockAdmin, createAuthHeader, mockAuthUser } = require('./helpers');

const { hashPassword } = require('../utils/password');

describe('Authentication & User Authorization API', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/auth/signup', () => {
    test('succeeds with valid user data and omits password in response', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      const fakeHashed = '$2b$10$hashedpasswordstring';
      const createdUser = {
        _id: '65f1a2b3c4d5e6f7a8b9c0d1',
        firstname: 'Alice',
        lastname: 'Recruiter',
        companyname: 'TalentHub',
        email: 'alice@example.com',
        role: 'user',
        password: fakeHashed,
        toObject() {
          const obj = { ...this };
          delete obj.password;
          return obj;
        }
      };
      jest.spyOn(User, 'create').mockResolvedValue(createdUser);

      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          firstname: 'Alice',
          lastname: 'Recruiter',
          companyname: 'TalentHub',
          email: 'alice@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('alice@example.com');
      expect(res.body.data.password).toBeUndefined();
    });

    test('rejects duplicate email with 409 Conflict', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue({ email: 'duplicate@example.com' });

      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          firstname: 'Alice',
          email: 'duplicate@example.com',
          password: 'Password123!'
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already exists/i);
    });

    test('rejects missing required fields with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          firstname: 'Alice'
          // missing email and password
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    test('rejects invalid email format with 400 Bad Request', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          firstname: 'Alice',
          email: 'not-an-email',
          password: 'Password123!'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/valid email/i);
    });

    test('rejects passwords shorter than 6 characters with 400', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({
          firstname: 'Alice',
          email: 'alice@example.com',
          password: '123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/at least 6 characters/i);
    });
  });

  describe('POST /api/auth/signin', () => {
    test('succeeds with valid credentials and returns JWT token and sanitized user', async () => {
      const password = 'CorrectPassword123!';
      const hashedPassword = await hashPassword(password);
      const userDoc = {
        _id: '65f1a2b3c4d5e6f7a8b9c0d1',
        firstname: 'Jane',
        lastname: 'Doe',
        email: 'jane@example.com',
        role: 'user',
        password: hashedPassword,
        toObject() {
          const obj = { ...this };
          delete obj.password;
          return obj;
        }
      };
      jest.spyOn(User, 'findOne').mockResolvedValue(userDoc);

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'jane@example.com',
          password
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('jane@example.com');
      expect(res.body.data.user.password).toBeUndefined();
    });

    test('fails with 401 for incorrect password', async () => {
      const hashedPassword = await hashPassword('CorrectPassword123!');
      const userDoc = {
        _id: '65f1a2b3c4d5e6f7a8b9c0d1',
        email: 'jane@example.com',
        password: hashedPassword
      };
      jest.spyOn(User, 'findOne').mockResolvedValue(userDoc);

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'jane@example.com',
          password: 'WrongPassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid email or password/i);
    });

    test('fails with 401 for nonexistent user', async () => {
      jest.spyOn(User, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/auth/signin')
        .send({
          email: 'nonexistent@example.com',
          password: 'SomePassword123!'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/invalid email or password/i);
    });
  });

  describe('Authentication Middleware', () => {
    test('rejects request with missing Authorization header (401)', async () => {
      const res = await request(app).get('/api/users/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/authentication required/i);
    });

    test('rejects malformed Authorization header without Bearer prefix (401)', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Basic dXNlcjpwYXNz');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/authentication required/i);
    });

    test('rejects malformed token format (401)', async () => {
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', 'Bearer invalid.token.structure');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });


    test('rejects token signed with wrong secret (401)', async () => {
      const foreignToken = jwt.sign({ userId: '123' }, 'wrong-secret-key');
      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${foreignToken}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('rejects expired token (401)', async () => {
      const secret = process.env.JWT_SECRET || 'dev-only-local-secret-do-not-use-in-production';
      const expiredToken = jwt.sign(
        { userId: mockUser._id.toString(), email: mockUser.email, role: mockUser.role },
        secret,
        { expiresIn: '-1s' }
      );

      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/expired/i);
    });
  });

  describe('User Authorization & Profile Access', () => {
    test('authenticated user can access /api/users/me', async () => {
      jest.spyOn(User, 'findById').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          ...mockUser,
          toObject: () => mockUser
        })
      });

      const res = await request(app)
        .get('/api/users/me')
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(mockUser.email);
    });

    test('ignores role escalation attempt in PUT /api/users/me', async () => {
      mockAuthUser(mockUser);
      const findByIdAndUpdateSpy = jest.spyOn(User, 'findByIdAndUpdate').mockReturnValue({
        select: jest.fn().mockResolvedValue({
          ...mockUser,
          firstname: 'UpdatedName',
          role: 'user',
          toObject: () => ({ ...mockUser, firstname: 'UpdatedName', role: 'user' })
        })
      });


      const res = await request(app)
        .put('/api/users/me')
        .set('Authorization', createAuthHeader(mockUser))
        .send({
          firstname: 'UpdatedName',
          role: 'admin' // Attempted privilege escalation
        });

      expect(res.status).toBe(200);
      expect(findByIdAndUpdateSpy).toHaveBeenCalled();
      const updateArgs = findByIdAndUpdateSpy.mock.calls[0][1];
      expect(updateArgs.role).toBeUndefined();
    });
  });
});

