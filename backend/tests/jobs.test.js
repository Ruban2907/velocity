const request = require('supertest');
const app = require('../app');
const JobSpec = require('../model/JobSpec');
const Candidate = require('../model/Candidate');
const { mockUser, mockRecruiter2, mockAdmin, createAuthHeader, mockAuthUser } = require('./helpers');

describe('Job Specification Authorization API', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/jobs (Job Creation)', () => {
    test('unauthenticated job creation is rejected with 401', async () => {
      const res = await request(app)
        .post('/api/jobs')
        .send({ job_title: ['Software Engineer'] });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('authenticated recruiter creates job and server assigns createdBy from JWT user', async () => {
      mockAuthUser(mockUser);
      let capturedDoc = null;
      jest.spyOn(JobSpec.prototype, 'save').mockImplementation(function() {
        this._id = '66a1b2c3d4e5f6a7b8c9d0e1';
        capturedDoc = this;
        return Promise.resolve(this);
      });


      const res = await request(app)
        .post('/api/jobs')
        .set('Authorization', createAuthHeader(mockUser))
        .send({
          job_title: ['Full Stack Engineer'],
          location: ['Remote'],
          createdBy: mockRecruiter2._id // Tampering attempt: trying to assign to another user
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(capturedDoc).toBeDefined();
      // Server must enforce createdBy from req.user._id, ignoring the body
      expect(capturedDoc.createdBy.toString()).toBe(mockUser._id.toString());
    });
  });

  describe('GET /api/jobs (Job Listing & Aggregation)', () => {
    test('unauthenticated job list request is rejected with 401', async () => {
      const res = await request(app).get('/api/jobs');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('recruiter fetches jobs with aggregated candidate counts and bounded pagination', async () => {
      mockAuthUser(mockUser);
      const mockJobDoc = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e1',
        jobTitle: ['Lead Backend Engineer'],
        createdBy: mockUser._id,
        toObject: () => ({
          _id: '66a1b2c3d4e5f6a7b8c9d0e1',
          jobTitle: ['Lead Backend Engineer'],
          createdBy: mockUser._id
        })
      };

      const mockQueryChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([mockJobDoc])
      };
      jest.spyOn(JobSpec, 'find').mockReturnValue(mockQueryChain);
      jest.spyOn(Candidate, 'aggregate').mockResolvedValue([
        { _id: '66a1b2c3d4e5f6a7b8c9d0e1', count: 7 }
      ]);

      const res = await request(app)
        .get('/api/jobs?page=1&limit=50')
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0].candidateCount).toBe(7);
      expect(mockQueryChain.limit).toHaveBeenCalledWith(50);
    });

    test('multiple jobs correctly map individual candidate counts and zero counts', async () => {
      mockAuthUser(mockUser);
      const job1 = {
        _id: '66a1b2c3d4e5f6a7b8c9d001',
        jobTitle: ['Frontend Engineer'],
        createdBy: mockUser._id,
        toObject: () => ({ _id: '66a1b2c3d4e5f6a7b8c9d001', jobTitle: ['Frontend Engineer'] })
      };
      const job2WithZero = {
        _id: '66a1b2c3d4e5f6a7b8c9d002',
        jobTitle: ['DevOps Engineer'],
        createdBy: mockUser._id,
        toObject: () => ({ _id: '66a1b2c3d4e5f6a7b8c9d002', jobTitle: ['DevOps Engineer'] })
      };
      const job3 = {
        _id: '66a1b2c3d4e5f6a7b8c9d003',
        jobTitle: ['QA Engineer'],
        createdBy: mockUser._id,
        toObject: () => ({ _id: '66a1b2c3d4e5f6a7b8c9d003', jobTitle: ['QA Engineer'] })
      };

      const mockQueryChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([job1, job2WithZero, job3])
      };
      jest.spyOn(JobSpec, 'find').mockReturnValue(mockQueryChain);
      // Aggregate returns counts only for job1 and job3; job2 has no candidates in DB
      jest.spyOn(Candidate, 'aggregate').mockResolvedValue([
        { _id: '66a1b2c3d4e5f6a7b8c9d001', count: 5 },
        { _id: '66a1b2c3d4e5f6a7b8c9d003', count: 12 }
      ]);

      const res = await request(app)
        .get('/api/jobs')
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(3);
      expect(res.body.data[0].candidateCount).toBe(5);
      expect(res.body.data[1].candidateCount).toBe(0); // Job with zero candidates must be 0
      expect(res.body.data[2].candidateCount).toBe(12);
    });

    test('falls back safely to countDocuments when aggregate is unavailable', async () => {
      mockAuthUser(mockUser);
      const job = {
        _id: '66a1b2c3d4e5f6a7b8c9d001',
        jobTitle: ['Data Engineer'],
        createdBy: mockUser._id,
        toObject: () => ({ _id: '66a1b2c3d4e5f6a7b8c9d001', jobTitle: ['Data Engineer'] })
      };

      const mockQueryChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([job])
      };
      jest.spyOn(JobSpec, 'find').mockReturnValue(mockQueryChain);
      jest.spyOn(Candidate, 'aggregate').mockRejectedValue(new Error('Mongo aggregate unsupported'));
      jest.spyOn(Candidate, 'countDocuments').mockResolvedValue(4);

      const res = await request(app)
        .get('/api/jobs')
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data[0].candidateCount).toBe(4);
    });

    test('admin fetches all jobs without recruiter tenant filter', async () => {
      mockAuthUser(mockAdmin);
      const mockQueryChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };
      const findSpy = jest.spyOn(JobSpec, 'find').mockReturnValue(mockQueryChain);

      const res = await request(app)
        .get('/api/jobs')
        .set('Authorization', createAuthHeader(mockAdmin));

      expect(res.status).toBe(200);
      // Admin filter must be empty object {}
      expect(findSpy).toHaveBeenCalledWith({});
    });
  });


  describe('GET /api/jobs/:id (Job Inspection)', () => {
    test('recruiter can access their own job', async () => {
      mockAuthUser(mockUser);
      const userJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e1',
        jobTitle: ['Backend Engineer'],
        createdBy: {
          toString: () => mockUser._id,
          equals: (id) => id.toString() === mockUser._id.toString()
        },
        toObject: () => ({ _id: '66a1b2c3d4e5f6a7b8c9d0e1', jobTitle: ['Backend Engineer'] })
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(userJob);
      jest.spyOn(Candidate, 'countDocuments').mockResolvedValue(5);

      const res = await request(app)
        .get(`/api/jobs/${userJob._id}`)
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.candidateCount).toBe(5);
    });

    test('recruiter is forbidden from accessing another recruiter job (403)', async () => {
      mockAuthUser(mockUser);
      const otherUserJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e2',
        jobTitle: ['Secret Lead'],
        createdBy: {
          toString: () => mockRecruiter2._id,
          equals: (id) => id.toString() === mockRecruiter2._id.toString()
        },
        toObject: () => ({ _id: '66a1b2c3d4e5f6a7b8c9d0e2' })
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(otherUserJob);

      const res = await request(app)
        .get(`/api/jobs/${otherUserJob._id}`)
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/access denied/i);
    });

    test('admin can access any recruiter job', async () => {
      mockAuthUser(mockAdmin);
      const otherUserJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e2',
        jobTitle: ['Recruiter Job'],
        createdBy: {
          toString: () => mockRecruiter2._id,
          equals: (id) => id.toString() === mockRecruiter2._id.toString()
        },
        toObject: () => ({ _id: '66a1b2c3d4e5f6a7b8c9d0e2' })
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(otherUserJob);
      jest.spyOn(Candidate, 'countDocuments').mockResolvedValue(2);

      const res = await request(app)
        .get(`/api/jobs/${otherUserJob._id}`)
        .set('Authorization', createAuthHeader(mockAdmin));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('DELETE /api/jobs/:id (Job Deletion)', () => {
    test('recruiter can delete their own job', async () => {
      mockAuthUser(mockUser);
      const userJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e1',
        createdBy: {
          equals: (id) => id.toString() === mockUser._id.toString()
        }
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(userJob);
      jest.spyOn(Candidate, 'deleteMany').mockResolvedValue({ deletedCount: 3 });
      const deleteSpy = jest.spyOn(JobSpec, 'findByIdAndDelete').mockResolvedValue(userJob);

      const res = await request(app)
        .delete(`/api/jobs/${userJob._id}`)
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deleteSpy).toHaveBeenCalledWith(userJob._id);
    });

    test('recruiter cannot delete another recruiter job (403)', async () => {
      mockAuthUser(mockUser);
      const otherJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e2',
        createdBy: {
          equals: (id) => id.toString() === mockRecruiter2._id.toString()
        }
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(otherJob);
      const deleteSpy = jest.spyOn(JobSpec, 'findByIdAndDelete');
      const candidateDeleteSpy = jest.spyOn(Candidate, 'deleteMany');

      const res = await request(app)
        .delete(`/api/jobs/${otherJob._id}`)
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(candidateDeleteSpy).not.toHaveBeenCalled();
    });

    test('admin can delete any job specification', async () => {
      mockAuthUser(mockAdmin);
      const anyJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e2',
        createdBy: {
          equals: () => false
        }
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(anyJob);
      jest.spyOn(Candidate, 'deleteMany').mockResolvedValue({ deletedCount: 1 });
      const deleteSpy = jest.spyOn(JobSpec, 'findByIdAndDelete').mockResolvedValue(anyJob);

      const res = await request(app)
        .delete(`/api/jobs/${anyJob._id}`)
        .set('Authorization', createAuthHeader(mockAdmin));

      expect(res.status).toBe(200);
      expect(deleteSpy).toHaveBeenCalledWith(anyJob._id);
    });

    test('legacy job with missing createdBy cannot be deleted by non-admin recruiter (403)', async () => {
      mockAuthUser(mockUser);
      const legacyJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e9',
        createdBy: null // Legacy job without createdBy
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(legacyJob);
      const deleteSpy = jest.spyOn(JobSpec, 'findByIdAndDelete');
      const candidateDeleteSpy = jest.spyOn(Candidate, 'deleteMany');

      const res = await request(app)
        .delete(`/api/jobs/${legacyJob._id}`)
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(candidateDeleteSpy).not.toHaveBeenCalled();
    });


    test('legacy job with missing createdBy can be deleted by admin', async () => {
      mockAuthUser(mockAdmin);
      const legacyJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e9',
        createdBy: null
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(legacyJob);
      jest.spyOn(Candidate, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
      const deleteSpy = jest.spyOn(JobSpec, 'findByIdAndDelete').mockResolvedValue(legacyJob);

      const res = await request(app)
        .delete(`/api/jobs/${legacyJob._id}`)
        .set('Authorization', createAuthHeader(mockAdmin));

      expect(res.status).toBe(200);
      expect(deleteSpy).toHaveBeenCalledWith(legacyJob._id);
    });
  });
});
