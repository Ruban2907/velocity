const request = require('supertest');
const app = require('../app');
const Assessment = require('../model/Assessment');
const ExamAttempt = require('../model/ExamAttempt');
const nodemailer = require('nodemailer');
const { mockUser, mockRecruiter2, createAuthHeader, mockAuthUser } = require('./helpers');

describe('Assessment & Exam API (Offline Gemini Mocks)', () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-api-key-12345';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalGeminiKey) {
      process.env.GEMINI_API_KEY = originalGeminiKey;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
    jest.restoreAllMocks();
  });

  describe('POST /api/assessments/generate', () => {
    test('unauthenticated request is rejected with 401', async () => {
      const res = await request(app)
        .post('/api/assessments/generate')
        .send({ jobTitle: 'React Developer' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('missing jobTitle is rejected with 400 Bad Request', async () => {
      mockAuthUser(mockUser);

      const res = await request(app)
        .post('/api/assessments/generate')
        .set('Authorization', createAuthHeader(mockUser))
        .send({ skills: 'React, Node.js' }); // missing jobTitle

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/jobTitle is required/i);
    });

    test('succeeds with authorized recruiter when Gemini returns valid question JSON and assigns createdBy', async () => {
      mockAuthUser(mockUser);

      const mockQuestions = [
        {
          question: 'What is JSX in React?',
          options: [
            'A. JavaScript XML syntax extension',
            'B. Java Standard XML',
            'C. JSON Style XML',
            'D. JavaScript Execution Engine'
          ],
          answer: 'A',
          explanation: 'JSX allows writing HTML-like code inside JavaScript.',
          difficulty: 'easy'
        }
      ];

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify(mockQuestions) }]
              }
            }
          ]
        })
      });

      let savedData = null;
      jest.spyOn(Assessment, 'create').mockImplementation((data) => {
        savedData = data;
        return Promise.resolve({
          ...data,
          _id: '66c1b2c3d4e5f6a7b8c9d0a1'
        });
      });

      const res = await request(app)
        .post('/api/assessments/generate')
        .set('Authorization', createAuthHeader(mockUser))
        .send({
          jobTitle: 'Frontend Engineer',
          skills: 'React, TypeScript',
          seniority: 'Mid-level'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.questions).toHaveLength(1);
      expect(res.body.data.questions[0].question).toBe('What is JSX in React?');
      expect(savedData).toBeDefined();
      expect(savedData.createdBy.toString()).toBe(mockUser._id.toString());
      expect(global.fetch).toHaveBeenCalled();
    });

    test('handles Gemini API failure safely and returns error response without crashing Express', async () => {
      mockAuthUser(mockUser);

      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => 'Invalid API call parameters'
      });

      const res = await request(app)
        .post('/api/assessments/generate')
        .set('Authorization', createAuthHeader(mockUser))
        .send({
          jobTitle: 'Frontend Engineer'
        });

      expect([500, 503]).toContain(res.status);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBeDefined();
    });

    test('handles malformed unparseable Gemini response safely with 500 error', async () => {
      mockAuthUser(mockUser);

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [{ text: 'This is not valid JSON and cannot be converted to questions' }]
              }
            }
          ]
        })
      });

      const res = await request(app)
        .post('/api/assessments/generate')
        .set('Authorization', createAuthHeader(mockUser))
        .send({
          jobTitle: 'Backend Developer'
        });

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Failed to parse Gemini JSON response/i);
    });
  });

  describe('POST /api/assessments/send (Email Invitation & Tenant Isolation)', () => {
    test('rejects unauthenticated send request with 401', async () => {
      const res = await request(app)
        .post('/api/assessments/send')
        .send({ assessmentId: '66c1b2c3d4e5f6a7b8c9d0a1', candidateEmail: 'candidate@example.com' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('rejects request with missing required fields (400)', async () => {
      mockAuthUser(mockUser);

      const res = await request(app)
        .post('/api/assessments/send')
        .set('Authorization', createAuthHeader(mockUser))
        .send({ assessmentId: '66c1b2c3d4e5f6a7b8c9d0a1' }); // missing candidateEmail

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/required/i);
    });

    test('prevents Recruiter A from sending Recruiter B assessment (Tenant Isolation 404)', async () => {
      mockAuthUser(mockUser);

      // Assessment belongs to mockRecruiter2, query for createdBy: mockUser._id yields null
      jest.spyOn(Assessment, 'findOne').mockResolvedValue(null);

      const res = await request(app)
        .post('/api/assessments/send')
        .set('Authorization', createAuthHeader(mockUser))
        .send({
          assessmentId: '66c1b2c3d4e5f6a7b8c9d0a2',
          candidateEmail: 'candidate@example.com'
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Assessment not found/i);
    });

    test('sends assessment email with token link using mocked nodemailer', async () => {
      mockAuthUser(mockUser);

      process.env.SMTP_HOST = 'smtp.test.local';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'test@test.local';
      process.env.SMTP_PASS = 'mock-test-pass';
      process.env.SMTP_FROM = 'noreply@test.local';

      const ownedAssessment = {
        _id: '66c1b2c3d4e5f6a7b8c9d0a1',
        jobTitle: 'Senior React Engineer',
        totalQuestions: 10,
        createdBy: mockUser._id
      };
      jest.spyOn(Assessment, 'findOne').mockResolvedValue(ownedAssessment);

      jest.spyOn(ExamAttempt, 'create').mockResolvedValue({
        _id: '66c1b2c3d4e5f6a7b8c9d0e9',
        token: 'mock-exam-token-12345'
      });

      const sendMailMock = jest.fn().mockResolvedValue({ messageId: 'msg-123' });
      jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
        sendMail: sendMailMock
      });

      const res = await request(app)
        .post('/api/assessments/send')
        .set('Authorization', createAuthHeader(mockUser))
        .send({
          assessmentId: ownedAssessment._id,
          candidateEmail: 'candidate@example.com',
          candidateName: 'John Candidate'
        });

      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      delete process.env.SMTP_FROM;

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.examLink).toMatch(/exam\/[a-f0-9]{64}/);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'candidate@example.com',
          subject: expect.stringContaining('Senior React Engineer')
        })
      );
    });

    test('handles SMTP mail failure safely and returns 500 error response without crashing', async () => {
      mockAuthUser(mockUser);

      process.env.SMTP_HOST = 'smtp.test.local';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'test@test.local';
      process.env.SMTP_PASS = 'mock-test-pass';
      process.env.SMTP_FROM = 'noreply@test.local';

      const ownedAssessment = {
        _id: '66c1b2c3d4e5f6a7b8c9d0a1',
        jobTitle: 'React Engineer',
        totalQuestions: 5,
        createdBy: mockUser._id
      };
      jest.spyOn(Assessment, 'findOne').mockResolvedValue(ownedAssessment);
      jest.spyOn(ExamAttempt, 'create').mockResolvedValue({ _id: '66c1b2c3d4e5f6a7b8c9d0e9' });

      jest.spyOn(nodemailer, 'createTransport').mockReturnValue({
        sendMail: jest.fn().mockRejectedValue(new Error('SMTP connection timeout'))
      });

      const res = await request(app)
        .post('/api/assessments/send')
        .set('Authorization', createAuthHeader(mockUser))
        .send({
          assessmentId: ownedAssessment._id,
          candidateEmail: 'candidate@example.com'
        });

      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
      delete process.env.SMTP_FROM;

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/SMTP connection timeout/i);
    });
  });


  describe('GET /api/assessments/exam/:token (Candidate Exam Loader)', () => {
    test('loads exam and sanitizes questions so answers and explanations are never sent to candidate', async () => {
      const mockAttempt = {
        candidateName: 'Candidate One',
        candidateEmail: 'candidate@example.com',
        token: 'valid-token-xyz',
        status: 'sent',
        expiresAt: new Date(Date.now() + 3600000), // Expires in 1 hour
        assessmentId: {
          jobTitle: 'React Engineer',
          totalQuestions: 1,
          questions: [
            {
              question: 'What is JSX?',
              options: ['A. Syntax', 'B. Tool', 'C. Engine', 'D. Lib'],
              answer: 'A', // MUST BE STRIPPED
              explanation: 'JSX is syntax', // MUST BE STRIPPED
              difficulty: 'easy'
            }
          ]
        },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findOne').mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockAttempt)
      });

      const res = await request(app).get(`/api/assessments/exam/${mockAttempt.token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.candidateName).toBe('Candidate One');
      expect(res.body.data.questions).toHaveLength(1);
      // Verify answer and explanation are not exposed
      expect(res.body.data.questions[0].answer).toBeUndefined();
      expect(res.body.data.questions[0].explanation).toBeUndefined();
      expect(res.body.data.questions[0].question).toBe('What is JSX?');
    });

    test('rejects invalid or non-existent exam token with 404', async () => {
      jest.spyOn(ExamAttempt, 'findOne').mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      const res = await request(app).get('/api/assessments/exam/nonexistent-token');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Invalid exam link/i);
    });

    test('rejects expired exam link with 400', async () => {
      const expiredAttempt = {
        token: 'expired-token',
        status: 'sent',
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        assessmentId: { jobTitle: 'React Engineer', questions: [] },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findOne').mockReturnValue({
        populate: jest.fn().mockResolvedValue(expiredAttempt)
      });

      const res = await request(app).get('/api/assessments/exam/expired-token');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/expired/i);
      expect(expiredAttempt.status).toBe('expired');
      expect(expiredAttempt.save).toHaveBeenCalled();
    });

    test('rejects cancelled exam link with 400', async () => {
      const cancelledAttempt = {
        token: 'cancelled-token',
        status: 'cancelled',
        assessmentId: { jobTitle: 'React Engineer' }
      };

      jest.spyOn(ExamAttempt, 'findOne').mockReturnValue({
        populate: jest.fn().mockResolvedValue(cancelledAttempt)
      });

      const res = await request(app).get('/api/assessments/exam/cancelled-token');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cancelled/i);
    });
  });

  describe('POST /api/assessments/exam/:token/submit (Exam Evaluation)', () => {
    test('evaluates submitted candidate answers accurately and records score and antiCheat', async () => {
      const mockAttempt = {
        _id: '66c1b2c3d4e5f6a7b8c9d0b2',
        token: 'valid-candidate-exam-token-123',
        status: 'started',
        assessmentId: {
          jobTitle: 'Full Stack Engineer',
          questions: [
            {
              question: 'Which method starts an HTTP server in Node?',
              options: ['A. app.listen', 'B. app.run', 'C. app.start', 'D. app.serve'],
              answer: 'A'
            },
            {
              question: 'What hook is used for side effects in React?',
              options: ['A. useState', 'B. useEffect', 'C. useContext', 'D. useReducer'],
              answer: 'B'
            }
          ]
        },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findOne').mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockAttempt)
      });

      const res = await request(app)
        .post(`/api/assessments/exam/${mockAttempt.token}/submit`)
        .send({
          answers: {
            0: 'A', // Correct
            1: 'C', // Incorrect
            99: 'ExtraKey' // Extra unexpected key ignored safely
          },
          antiCheat: {
            tabSwitchCount: 1,
            fullScreenExitCount: 0
          }
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.score).toBe(1);
      expect(res.body.data.totalQuestions).toBe(2);
      expect(mockAttempt.status).toBe('submitted');
      expect(mockAttempt.score).toBe(1);
      expect(mockAttempt.antiCheat.tabSwitchCount).toBe(1);
      expect(mockAttempt.save).toHaveBeenCalled();
      // Verify evaluation response does not leak correct answers
      expect(res.body.data.questions).toBeUndefined();
    });

    test('handles empty or missing answers payload without throwing and records score 0', async () => {
      const mockAttempt = {
        token: 'token-empty-answers',
        status: 'started',
        assessmentId: {
          questions: [{ answer: 'A' }, { answer: 'B' }]
        },
        save: jest.fn().mockResolvedValue(true)
      };

      jest.spyOn(ExamAttempt, 'findOne').mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockAttempt)
      });

      const res = await request(app)
        .post('/api/assessments/exam/token-empty-answers/submit')
        .send({}); // missing answers object

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.score).toBe(0);
      expect(mockAttempt.score).toBe(0);
    });

    test('rejects resubmission of already submitted exam with 400 Bad Request', async () => {
      const alreadySubmittedAttempt = {
        _id: '66c1b2c3d4e5f6a7b8c9d0b3',
        token: 'already-used-token',
        status: 'submitted',
        assessmentId: {
          questions: []
        }
      };

      jest.spyOn(ExamAttempt, 'findOne').mockReturnValue({
        populate: jest.fn().mockResolvedValue(alreadySubmittedAttempt)
      });

      const res = await request(app)
        .post(`/api/assessments/exam/${alreadySubmittedAttempt.token}/submit`)
        .send({ answers: {} });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/already submitted/i);
    });
  });

  describe('GET /api/assessments/submissions/:id (Recruiter Submission Detail & Isolation)', () => {
    test('rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/assessments/submissions/66c1b2c3d4e5f6a7b8c9d0b2');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('prevents Recruiter A from viewing Recruiter B candidate submission (Tenant Isolation 404)', async () => {
      mockAuthUser(mockUser);

      // Attempt recruiterId does not match mockUser._id
      jest.spyOn(ExamAttempt, 'findOne').mockReturnValue({
        populate: jest.fn().mockResolvedValue(null)
      });

      const res = await request(app)
        .get('/api/assessments/submissions/66c1b2c3d4e5f6a7b8c9d0b2')
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Submission not found/i);
    });

    test('allows owner recruiter to view detailed candidate answer breakdown', async () => {
      mockAuthUser(mockUser);

      const ownedAttempt = {
        _id: '66c1b2c3d4e5f6a7b8c9d0b2',
        recruiterId: mockUser._id,
        candidateName: 'Jane Candidate',
        candidateEmail: 'jane@example.com',
        status: 'submitted',
        score: 1,
        totalQuestions: 1,
        answers: { '0': 'A' },
        assessmentId: {
          jobTitle: 'Frontend Engineer',
          questions: [
            {
              question: 'What is JSX?',
              options: ['A. Syntax', 'B. Engine', 'C. Tool', 'D. Lib'],
              answer: 'A',
              explanation: 'JSX is syntax',
              difficulty: 'easy'
            }
          ]
        }
      };

      jest.spyOn(ExamAttempt, 'findOne').mockReturnValue({
        populate: jest.fn().mockResolvedValue(ownedAttempt)
      });

      const res = await request(app)
        .get(`/api/assessments/submissions/${ownedAttempt._id}`)
        .set('Authorization', createAuthHeader(mockUser));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.candidateName).toBe('Jane Candidate');
      expect(res.body.data.questionBreakdown).toHaveLength(1);
      expect(res.body.data.questionBreakdown[0].selectedAnswer).toBe('A');
      expect(res.body.data.questionBreakdown[0].correctAnswer).toBe('A');
      expect(res.body.data.questionBreakdown[0].isCorrect).toBe(true);
    });
  });
});
