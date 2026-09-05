jest.mock('../services/apifyLeadService', () => {
  const actual = jest.requireActual('../services/apifyLeadService');
  return {
    fetchLeadsFromApify: jest.fn(),
    buildApifyInput: jest.fn((...args) => actual.buildApifyInput(...args))
  };
});



const request = require('supertest');
const app = require('../app');
const JobSpec = require('../model/JobSpec');
const Candidate = require('../model/Candidate');
const SearchCache = require('../model/SearchCache');
const apifyService = require('../services/apifyLeadService');
const { mockUser, mockRecruiter2, mockAdmin, createAuthHeader, mockAuthUser } = require('./helpers');


describe('Recruitment & Candidate Sourcing API', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/recruitment/search', () => {
    test('unauthenticated search request is rejected with 401', async () => {
      apifyService.fetchLeadsFromApify.mockClear();

      const res = await request(app)
        .post('/api/recruitment/search')
        .set('X-Forwarded-For', '10.2.1.1')
        .send({ jobId: '66a1b2c3d4e5f6a7b8c9d0e1' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(apifyService.fetchLeadsFromApify).not.toHaveBeenCalled();
    });

    test('recruiter cannot search candidates for another recruiter job (403) and Apify is NOT called', async () => {
      mockAuthUser(mockUser);
      apifyService.fetchLeadsFromApify.mockClear();

      const otherJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e2',
        jobTitle: ['Staff Engineer'],
        createdBy: {
          equals: (id) => id.toString() === mockRecruiter2._id.toString()
        }
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(otherJob);

      const res = await request(app)
        .post('/api/recruitment/search')
        .set('Authorization', createAuthHeader(mockUser))
        .set('X-Forwarded-For', '10.2.1.2')
        .send({ jobId: otherJob._id });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/access denied/i);
      // Critical security check: external paid Apify service must never be invoked
      expect(apifyService.fetchLeadsFromApify).not.toHaveBeenCalled();
    });

    test('authenticated recruiter can source candidates for their own job with Apify mocked', async () => {
      mockAuthUser(mockUser);
      const ownedJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e1',
        jobTitle: ['React Developer'],
        location: ['New York'],
        perPage: 10,
        createdBy: {
          equals: (id) => id.toString() === mockUser._id.toString()
        }
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(ownedJob);
      jest.spyOn(Candidate, 'find').mockResolvedValue([]); // No existing candidates in DB
      jest.spyOn(SearchCache, 'findOne').mockResolvedValue(null); // No cache

      apifyService.fetchLeadsFromApify.mockResolvedValue({
        items: [
          {
            name: 'Sarah Connor',
            title: 'Senior React Developer',
            company: 'TechCorp',
            email: 'sarah@example.com'
          }
        ],
        metadata: { rawCount: 1, realItemsCount: 1 }
      });
      let insertedCandidates = null;
      jest.spyOn(Candidate, 'insertMany').mockImplementation((items) => {
        insertedCandidates = items;
        return Promise.resolve(items);
      });
      jest.spyOn(Candidate, 'bulkWrite').mockResolvedValue({ upsertedCount: 1 });
      jest.spyOn(SearchCache, 'findOneAndUpdate').mockResolvedValue({});

      const res = await request(app)
        .post('/api/recruitment/search')
        .set('Authorization', createAuthHeader(mockUser))
        .set('X-Forwarded-For', '10.2.1.3')
        .send({ jobId: ownedJob._id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      // Apify must be called exactly once
      expect(apifyService.fetchLeadsFromApify).toHaveBeenCalledTimes(1);
      expect(apifyService.fetchLeadsFromApify).toHaveBeenCalledWith(ownedJob);
      // Verify normalized candidate schema persistence and the fixed enum value
      expect(insertedCandidates).toBeDefined();
      expect(insertedCandidates).toHaveLength(1);
      expect(insertedCandidates[0].contactStatus).toBe('not_contacted');
      expect(insertedCandidates[0].name).toBe('Sarah Connor');
    });

    test('cache hit returns saved candidates from cache without calling Apify', async () => {
      mockAuthUser(mockUser);
      apifyService.fetchLeadsFromApify.mockClear();

      const ownedJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e1',
        jobTitle: ['React Developer'],
        createdBy: {
          equals: (id) => id.toString() === mockUser._id.toString()
        }
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(ownedJob);
      jest.spyOn(Candidate, 'find').mockResolvedValue([]);
      jest.spyOn(SearchCache, 'findOne').mockResolvedValue({
        candidates: [
          {
            name: 'Cached Candidate',
            title: 'React Developer',
            company: 'Cached Corp',
            email: 'cached@example.com'
          }
        ]
      });

      const res = await request(app)
        .post('/api/recruitment/search')
        .set('Authorization', createAuthHeader(mockUser))
        .set('X-Forwarded-For', '10.2.1.4')
        .send({ jobId: ownedJob._id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toMatch(/saved search cache/i);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('Cached Candidate');
      // Apify must NOT be called on cache hit
      expect(apifyService.fetchLeadsFromApify).not.toHaveBeenCalled();
    });

    test('handles Apify execution failure safely with 500 error response without crashing', async () => {
      mockAuthUser(mockUser);
      const ownedJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e1',
        jobTitle: ['React Developer'],
        createdBy: {
          equals: (id) => id.toString() === mockUser._id.toString()
        }
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(ownedJob);
      jest.spyOn(Candidate, 'find').mockResolvedValue([]);
      jest.spyOn(SearchCache, 'findOne').mockResolvedValue(null);
      apifyService.fetchLeadsFromApify.mockRejectedValue(new Error('Apify API rate limit exceeded'));

      const res = await request(app)
        .post('/api/recruitment/search')
        .set('Authorization', createAuthHeader(mockUser))
        .set('X-Forwarded-For', '10.2.1.5')
        .send({ jobId: ownedJob._id });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Apify API rate limit exceeded/i);
    });

    test('admin can source candidates for any recruiter job', async () => {
      mockAuthUser(mockAdmin);
      const recruiterJob = {
        _id: '66a1b2c3d4e5f6a7b8c9d0e1',
        jobTitle: ['Node Developer'],
        location: ['San Francisco'],
        perPage: 5,
        createdBy: {
          equals: (id) => id.toString() === mockUser._id.toString() // owned by mockUser, requested by admin
        }
      };
      jest.spyOn(JobSpec, 'findById').mockResolvedValue(recruiterJob);
      jest.spyOn(Candidate, 'find').mockResolvedValue([]);
      jest.spyOn(SearchCache, 'findOne').mockResolvedValue(null);
      apifyService.fetchLeadsFromApify.mockResolvedValue({
        items: [],
        metadata: { rawCount: 0, realItemsCount: 0 }
      });

      const res = await request(app)
        .post('/api/recruitment/search')
        .set('Authorization', createAuthHeader(mockAdmin))
        .set('X-Forwarded-For', '10.2.1.6')
        .send({ jobId: recruiterJob._id });

      expect(res.status).toBe(200);
      expect(apifyService.fetchLeadsFromApify).toHaveBeenCalled();
    });
  });



  describe('Candidate Protection Endpoints', () => {
    test('unauthenticated GET /api/recruitment/candidates is rejected with 401', async () => {
      const res = await request(app).get('/api/recruitment/candidates');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('unauthenticated PUT /api/recruitment/candidates/:id/contacted is rejected with 401', async () => {
      const res = await request(app).put('/api/recruitment/candidates/123/contacted');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('unauthenticated DELETE /api/recruitment/candidates/:id is rejected with 401', async () => {
      const res = await request(app).delete('/api/recruitment/candidates/123');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
