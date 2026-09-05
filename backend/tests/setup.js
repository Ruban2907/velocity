process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-12345678901234567890';
process.env.FRONTEND_URL = 'http://localhost:5173';
delete process.env.GEMINI_API_KEY;
delete process.env.APIFY_TOKEN;
delete process.env.SMTP_PASS;


// Mock activity logging so tests do not hang on unbuffered MongoDB writes
jest.mock('../utils/activityLogger', () => ({
  logActivity: jest.fn().mockResolvedValue({})
}));

// Mock email delivery so tests never attempt network SMTP connections
jest.mock('../utils/emailService', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ messageId: 'test-email-id' })
}));
