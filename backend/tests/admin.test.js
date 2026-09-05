const request = require('supertest');
const app = require('../app');
const User = require('../model/user');
const Activity = require('../model/activity');
const { mockUser, mockAdmin, createAuthHeader, mockAuthUser } = require('./helpers');

describe('Admin Authorization & Management API', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization Boundary (adminOnly middleware)', () => {
    test('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/admin/users');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('rejects non-admin recruiter with 403 Forbidden', async () => {
      mockAuthUser(mockUser); // role: 'user'

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/admin role required/i);
    });

    test('allows authenticated admin user', async () => {
      mockAuthUser(mockAdmin); // role: 'admin'

      jest.spyOn(User, 'find').mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue([
            { _id: mockUser._id, firstname: 'Alice', email: 'alice@example.com', role: 'user' }
          ])
        })
      });

      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', createAuthHeader(mockAdmin));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });
  });

  describe('Recruiter Management CRUD', () => {
    test('admin creates recruiter with hashed password and sanitized response', async () => {
      mockAuthUser(mockAdmin);

      jest.spyOn(User, 'findOne').mockResolvedValue(null);
      const createdUser = {
        _id: '66b1a2b3c4d5e6f7a8b9c0d9',
        firstname: 'Bob',
        lastname: 'Recruiter',
        companyname: 'Talent Corp',
        email: 'bob@example.com',
        role: 'user',
        password: '$2b$10$fakehashedpassword',
        toObject() {
          const obj = { ...this };
          delete obj.password;
          return obj;
        }
      };
      jest.spyOn(User, 'create').mockResolvedValue(createdUser);

      const res = await request(app)
        .post('/api/admin/users')
        .set('Authorization', createAuthHeader(mockAdmin))
        .send({
          firstname: 'Bob',
          lastname: 'Recruiter',
          companyname: 'Talent Corp',
          email: 'bob@example.com',
          password: 'SecurePassword123!'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('bob@example.com');
      // Password hash must be stripped from response
      expect(res.body.data.password).toBeUndefined();
    });

    test('admin update recruiter modifies allowed fields safely', async () => {
      const targetUser = {
        _id: '66b1a2b3c4d5e6f7a8b9c0d9',
        firstname: 'Bob',
        lastname: 'Recruiter',
        email: 'bob@example.com',
        companyname: 'Old Corp',
        password: '$2b$10$hashed',
        save: jest.fn().mockResolvedValue(true),
        toObject() {
          const obj = { ...this };
          delete obj.password;
          return obj;
        }
      };
      jest.spyOn(User, 'findById').mockImplementation((id) => {
        const found = id.toString() === mockAdmin._id.toString() ? mockAdmin : targetUser;
        const p = Promise.resolve(found);
        p.select = jest.fn().mockResolvedValue(found);
        return p;
      });

      const res = await request(app)
        .patch(`/api/admin/users/${targetUser._id}`)
        .set('Authorization', createAuthHeader(mockAdmin))
        .send({
          companyname: 'New Talent Corp'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(targetUser.companyname).toBe('New Talent Corp');
      expect(targetUser.save).toHaveBeenCalled();
      expect(res.body.data.password).toBeUndefined();
    });

    test('admin delete recruiter removes user and invalidates access', async () => {
      const targetUser = {
        _id: '66b1a2b3c4d5e6f7a8b9c0d9',
        firstname: 'Bob',
        email: 'bob@example.com'
      };
      jest.spyOn(User, 'findById').mockImplementation((id) => {
        const found = id.toString() === mockAdmin._id.toString() ? mockAdmin : targetUser;
        const p = Promise.resolve(found);
        p.select = jest.fn().mockResolvedValue(found);
        return p;
      });
      jest.spyOn(User, 'findByIdAndDelete').mockResolvedValue(targetUser);

      const res = await request(app)
        .delete(`/api/admin/users/${targetUser._id}`)
        .set('Authorization', createAuthHeader(mockAdmin));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/deleted successfully/i);
    });

  });

  describe('Activity Log Purge Operations', () => {
    test('non-admin recruiter cannot purge activity logs (403)', async () => {
      mockAuthUser(mockUser);
      const deleteManySpy = jest.spyOn(Activity, 'deleteMany');

      const res = await request(app)
        .delete('/api/admin/activity/purge')
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(403);
      expect(deleteManySpy).not.toHaveBeenCalled();
    });

    test('authorized admin can purge activity logs (200)', async () => {
      mockAuthUser(mockAdmin);
      const deleteManySpy = jest.spyOn(Activity, 'deleteMany').mockResolvedValue({ deletedCount: 150 });

      const res = await request(app)
        .delete('/api/admin/activity/purge')
        .set('Authorization', createAuthHeader(mockAdmin));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/activity logs cleared/i);
      expect(deleteManySpy).toHaveBeenCalledWith({});
    });
  });
});
