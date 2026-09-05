/**
 * MANUAL LIVE-SERVICE INTEGRATION TEST: Gemini Assessment Generation
 * 
 * Requirements:
 * 1. Active MongoDB running
 * 2. Backend server running on http://localhost:3000 (or configured PORT)
 * 3. Valid GEMINI_API_KEY configured in backend/.env
 * 
 * Usage:
 *   node scripts/manual_test_gemini.js
 */
require('dotenv').config();
const axios = require('axios');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000/api';

async function runManualGeminiTest() {
  const user = {
    firstname: 'QA',
    lastname: 'Tester',
    companyname: 'Velocity QA',
    email: `qa_gemini_${Date.now()}@example.com`,
    password: 'TestPassword123!'
  };

  try {
    console.log(`1. Registering QA user (${user.email})...`);
    await axios.post(`${BASE_URL}/auth/signup`, user);

    console.log("2. Authenticating QA user...");
    const loginRes = await axios.post(`${BASE_URL}/auth/signin`, {
      email: user.email,
      password: user.password
    });
    const token = loginRes.data.data?.token || loginRes.data.token;

    console.log("3. Triggering live Gemini assessment generation...");
    const genRes = await axios.post(
      `${BASE_URL}/assessments/generate`,
      {
        jobTitle: 'Senior React Developer',
        seniority: ['senior'],
        skills: 'React, TypeScript, Node.js',
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    console.log("PASS: Live assessment generated successfully!");
    console.log("Total questions generated:", genRes.data?.data?.questions?.length || genRes.data?.data?.totalQuestions);
  } catch (err) {
    console.error("FAIL: Live Gemini test failed:", err.response?.data || err.message);
    process.exit(1);
  }
}

runManualGeminiTest();
