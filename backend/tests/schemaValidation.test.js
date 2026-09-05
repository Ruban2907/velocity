const mongoose = require('mongoose');
const User = require('../model/user');
const Candidate = require('../model/Candidate');
const JobSpec = require('../model/JobSpec');
const PasswordResetToken = require('../model/PasswordResetToken');
const Assessment = require('../model/Assessment');
const ExamAttempt = require('../model/ExamAttempt');

describe('Mongoose Schema Validation & Type Integrity Tests', () => {
  describe('User Schema', () => {
    test('passes validation with valid fields and assigns default role "user"', () => {
      const user = new User({
        firstname: 'Alice',
        email: 'alice@example.com',
        password: '$2b$10$validhashedpassword'
      });

      const err = user.validateSync();
      expect(err).toBeUndefined();
      expect(user.role).toBe('user');
    });

    test('fails validation when required fields are missing', () => {
      const user = new User({});
      const err = user.validateSync();

      expect(err).toBeDefined();
      expect(err.errors.firstname).toBeDefined();
      expect(err.errors.email).toBeDefined();
      expect(err.errors.password).toBeDefined();
    });

    test('fails validation when role is outside the allowed enum ["user", "admin"]', () => {
      const user = new User({
        firstname: 'Attacker',
        email: 'attacker@example.com',
        password: '$2b$10$hashed',
        role: 'superadmin'
      });

      const err = user.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.role).toBeDefined();
      expect(err.errors.role.kind).toBe('enum');
    });
  });

  describe('Candidate Schema', () => {
    test('passes validation with valid ObjectId and defaults contactStatus to "not_contacted"', () => {
      const candidate = new Candidate({
        jobId: new mongoose.Types.ObjectId(),
        name: 'Jane Doe',
        email: 'jane@example.com'
      });

      const err = candidate.validateSync();
      expect(err).toBeUndefined();
      expect(candidate.contactStatus).toBe('not_contacted');
      expect(candidate.isRemoved).toBe(false);
      expect(candidate.matchScore).toBe(0);
      expect(candidate.matchLabel).toBe('Low match');
    });

    test('fails validation when jobId is missing', () => {
      const candidate = new Candidate({
        name: 'Jane Doe'
      });

      const err = candidate.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.jobId).toBeDefined();
    });

    test('fails validation with CastError when jobId is not a valid ObjectId', () => {
      const candidate = new Candidate({
        jobId: 'invalid-not-an-objectid-12345',
        name: 'Jane Doe'
      });

      const err = candidate.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.jobId.name).toBe('CastError');
    });

    test('fails validation when contactStatus is not in enum ["not_contacted", "contacted"]', () => {
      const candidate = new Candidate({
        jobId: new mongoose.Types.ObjectId(),
        name: 'Jane Doe',
        contactStatus: 'contact_in_progress'
      });

      const err = candidate.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.contactStatus).toBeDefined();
      expect(err.errors.contactStatus.kind).toBe('enum');
    });
  });

  describe('PasswordResetToken Schema', () => {
    test('passes validation with valid fields and verifies TTL index configuration', () => {
      const tokenDoc = new PasswordResetToken({
        userId: new mongoose.Types.ObjectId(),
        tokenHash: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 1000 * 60 * 20)
      });

      const err = tokenDoc.validateSync();
      expect(err).toBeUndefined();
      expect(tokenDoc.createdAt).toBeInstanceOf(Date);

      // Verify TTL index declared on expiresAt
      const indexes = PasswordResetToken.schema.indexes();
      const ttlIndex = indexes.find(idx => idx[0].expiresAt === 1 && idx[1] && idx[1].expireAfterSeconds === 0);
      expect(ttlIndex).toBeDefined();
    });

    test('fails validation when required fields are missing', () => {
      const tokenDoc = new PasswordResetToken({});
      const err = tokenDoc.validateSync();

      expect(err).toBeDefined();
      expect(err.errors.userId).toBeDefined();
      expect(err.errors.tokenHash).toBeDefined();
      expect(err.errors.expiresAt).toBeDefined();
    });

    test('fails validation when userId cannot be cast to ObjectId', () => {
      const tokenDoc = new PasswordResetToken({
        userId: 'not-a-valid-object-id',
        tokenHash: 'abc',
        expiresAt: new Date()
      });

      const err = tokenDoc.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.userId.name).toBe('CastError');
    });
  });

  describe('Assessment Schema & Question Subdocument', () => {
    test('passes validation with valid questions and 4 options per question', () => {
      const assessment = new Assessment({
        jobTitle: 'React Developer',
        totalQuestions: 1,
        questions: [
          {
            question: 'What is JSX?',
            options: ['A. Syntax', 'B. Engine', 'C. Parser', 'D. Tool'],
            answer: 'A',
            explanation: 'JSX is syntax',
            difficulty: 'easy'
          }
        ]
      });

      const err = assessment.validateSync();
      expect(err).toBeUndefined();
    });

    test('fails custom validator when question options count is not 4', () => {
      const assessment = new Assessment({
        jobTitle: 'React Developer',
        totalQuestions: 1,
        questions: [
          {
            question: 'What is JSX?',
            options: ['A. Syntax', 'B. Engine'], // Only 2 options
            answer: 'A',
            explanation: 'JSX is syntax',
            difficulty: 'easy'
          }
        ]
      });

      const err = assessment.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['questions.0.options']).toBeDefined();
      expect(err.errors['questions.0.options'].message).toMatch(/exactly 4 options/i);
    });

    test('fails validation when difficulty is outside allowed enum', () => {
      const assessment = new Assessment({
        jobTitle: 'React Developer',
        totalQuestions: 1,
        questions: [
          {
            question: 'What is JSX?',
            options: ['A. Syntax', 'B. Engine', 'C. Parser', 'D. Tool'],
            answer: 'A',
            explanation: 'JSX is syntax',
            difficulty: 'nightmare' // Invalid enum
          }
        ]
      });

      const err = assessment.validateSync();
      expect(err).toBeDefined();
      expect(err.errors['questions.0.difficulty'].kind).toBe('enum');
    });
  });

  describe('ExamAttempt Schema', () => {
    test('passes validation with valid attempt fields and default antiCheat metrics', () => {
      const attempt = new ExamAttempt({
        assessmentId: new mongoose.Types.ObjectId(),
        candidateEmail: 'candidate@example.com',
        token: 'exam-token-abc-123',
        expiresAt: new Date(Date.now() + 3600000)
      });

      const err = attempt.validateSync();
      expect(err).toBeUndefined();
      expect(attempt.status).toBe('sent');
      expect(attempt.score).toBe(0);
      expect(attempt.antiCheat.tabSwitchCount).toBe(0);
      expect(attempt.antiCheat.fullScreenExitCount).toBe(0);
      expect(attempt.antiCheat.micPermissionGranted).toBe(false);
    });

    test('fails validation when status is not in enum ["sent", "started", "submitted", "expired", "cancelled"]', () => {
      const attempt = new ExamAttempt({
        assessmentId: new mongoose.Types.ObjectId(),
        candidateEmail: 'candidate@example.com',
        token: 'exam-token-abc-123',
        expiresAt: new Date(),
        status: 'evaluating'
      });

      const err = attempt.validateSync();
      expect(err).toBeDefined();
      expect(err.errors.status.kind).toBe('enum');
    });
  });

  describe('JobSpec Schema', () => {
    test('automatically casts single string into array for array fields', () => {
      const job = new JobSpec({
        jobTitle: 'Backend Engineer', // String cast to [String]
        location: 'Remote'
      });

      expect(Array.isArray(job.jobTitle)).toBe(true);
      expect(job.jobTitle[0]).toBe('Backend Engineer');
      expect(job.createdBy).toBeNull();
    });
  });
});
