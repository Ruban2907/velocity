const fs = require('fs');
const path = require('path');
const request = require('supertest');
const axios = require('axios');
const app = require('../app');
const { mockUser, createAuthHeader, mockAuthUser } = require('./helpers');

describe('Resume Parser API Security & Validation', () => {
  const pdfFixturePath = path.join(__dirname, 'fixtures/minimal_valid.pdf');
  const docxFixturePath = path.join(__dirname, 'fixtures/minimal_valid.docx');

  const validPdfBase64 = fs.readFileSync(pdfFixturePath).toString('base64');
  const validDocxBase64 = fs.readFileSync(docxFixturePath).toString('base64');

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('unauthenticated request is rejected with 401 and AI service is not called', async () => {
    const axiosSpy = jest.spyOn(axios, 'post');

    const res = await request(app)
      .post('/api/resume/parse')
      .set('X-Forwarded-For', '10.3.1.1')
      .send({
        documentBase64: validPdfBase64,
        fileName: 'resume.pdf',
        position: 'Backend Developer',
        description: 'Requires Node.js and MongoDB experience'
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  test('valid authenticated PDF request succeeds and calls AI service exactly once', async () => {
    mockAuthUser(mockUser);

    const axiosSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: {
          name: 'Jane Developer',
          email: 'jane@example.com',
          skills: ['Node.js', 'Express', 'MongoDB'],
          experience: ['Backend Engineer at Acme Corp']
        },
        message: 'Parsed successfully'
      }
    });

    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.2')
      .send({
        documentBase64: validPdfBase64,
        fileName: 'jane_resume.pdf',
        position: 'Backend Developer',
        description: 'Requires Node.js and MongoDB experience'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Jane Developer');
    expect(res.body.data.insights).toBeDefined();
    expect(axiosSpy).toHaveBeenCalledTimes(1);
  });

  test('valid authenticated DOCX request succeeds and calls AI service', async () => {
    mockAuthUser(mockUser);

    const axiosSpy = jest.spyOn(axios, 'post').mockResolvedValue({
      status: 200,
      data: {
        success: true,
        data: {
          name: 'Bob Engineer',
          skills: ['TypeScript', 'React']
        }
      }
    });

    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.3')
      .send({
        documentBase64: validDocxBase64,
        fileName: 'bob_resume.docx',
        position: 'Frontend Engineer',
        description: 'React, TypeScript and UI components'
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(axiosSpy).toHaveBeenCalledTimes(1);
  });

  test('rejects .exe extension with 400 and does NOT call AI service', async () => {
    mockAuthUser(mockUser);
    const axiosSpy = jest.spyOn(axios, 'post');

    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.4')
      .send({
        documentBase64: validPdfBase64,
        fileName: 'malicious.exe',
        position: 'Backend Developer',
        description: 'Job description'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/only pdf.*and word/i);
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  test('rejects .js extension with 400 and does NOT call AI service', async () => {
    mockAuthUser(mockUser);
    const axiosSpy = jest.spyOn(axios, 'post');

    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.5')
      .send({
        documentBase64: validPdfBase64,
        fileName: 'exploit.js',
        position: 'Backend Developer',
        description: 'Job description'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/only pdf.*and word/i);
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  test('rejects .txt extension with 400 and does NOT call AI service', async () => {
    mockAuthUser(mockUser);
    const axiosSpy = jest.spyOn(axios, 'post');

    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.6')
      .send({
        documentBase64: validPdfBase64,
        fileName: 'plain_resume.txt',
        position: 'Backend Developer',
        description: 'Job description'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/only pdf.*and word/i);
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  test('rejects fake PDF extension with invalid magic bytes (400) and does not call AI', async () => {
    mockAuthUser(mockUser);
    const axiosSpy = jest.spyOn(axios, 'post');
    const fakeContent = Buffer.from('Plain text claiming to be a PDF file').toString('base64');

    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.7')
      .send({
        documentBase64: fakeContent,
        fileName: 'fake.pdf',
        position: 'Backend Developer',
        description: 'Job description'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid file format/i);
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  test('rejects fake DOCX extension with mismatched PDF magic bytes (400) and does not call AI', async () => {
    mockAuthUser(mockUser);
    const axiosSpy = jest.spyOn(axios, 'post');

    // Passing valid PDF bytes under a .docx filename
    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.8')
      .send({
        documentBase64: validPdfBase64,
        fileName: 'fake.docx',
        position: 'Backend Developer',
        description: 'Job description'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/file content mismatch/i);
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  test('rejects missing documentBase64 with 400 Bad Request', async () => {
    mockAuthUser(mockUser);
    const axiosSpy = jest.spyOn(axios, 'post');

    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.9')
      .send({
        fileName: 'resume.pdf',
        position: 'Backend Developer',
        description: 'Job description'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/documentBase64 is required/i);
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  test('rejects malformed base64 with 400 Bad Request', async () => {
    mockAuthUser(mockUser);
    const axiosSpy = jest.spyOn(axios, 'post');

    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.10')
      .send({
        documentBase64: '!!!NOT_VALID_BASE64_CHARACTERS###$$$',
        fileName: 'resume.pdf',
        position: 'Backend Developer',
        description: 'Job description'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/invalid base64 encoding/i);
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  test('rejects oversized payload (> 14MB base64 / ~10MB file) with 413 Payload Too Large', async () => {
    mockAuthUser(mockUser);
    const axiosSpy = jest.spyOn(axios, 'post');
    const oversizedBase64 = 'JVBERi' + 'A'.repeat(15 * 1024 * 1024);

    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.11')
      .send({
        documentBase64: oversizedBase64,
        fileName: 'huge.pdf',
        position: 'Backend Developer',
        description: 'Job description'
      });

    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/exceeds the maximum allowed size limit/i);
    expect(axiosSpy).not.toHaveBeenCalled();
  });

  test('returns 504 Gateway Timeout when AI parser request times out', async () => {
    mockAuthUser(mockUser);
    const timeoutErr = new Error('timeout of 60000ms exceeded');
    timeoutErr.code = 'ECONNABORTED';
    jest.spyOn(axios, 'post').mockRejectedValue(timeoutErr);

    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.12')
      .send({
        documentBase64: validPdfBase64,
        fileName: 'resume.pdf',
        position: 'Backend Developer',
        description: 'Job description'
      });

    expect(res.status).toBe(504);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/timed out/i);
  });

  test('returns 503 Service Unavailable when AI microservice is not reachable', async () => {
    mockAuthUser(mockUser);
    const connRefusedErr = new Error('connect ECONNREFUSED 127.0.0.1:8001');
    connRefusedErr.code = 'ECONNREFUSED';
    jest.spyOn(axios, 'post').mockRejectedValue(connRefusedErr);

    const res = await request(app)
      .post('/api/resume/parse')
      .set('Authorization', createAuthHeader(mockUser))
      .set('X-Forwarded-For', '10.3.1.13')
      .send({
        documentBase64: validPdfBase64,
        fileName: 'resume.pdf',
        position: 'Backend Developer',
        description: 'Job description'
      });

    expect(res.status).toBe(503);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/not reachable/i);
  });
});

