const http = require('http');

const BASE = 'http://localhost:3000';
const JOB_ID = '69ee05340de519625384d660';

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${BASE}${path}`, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch { resolve({ status: res.statusCode, body: d }); }
      });
    }).on('error', reject);
  });
}

(async () => {
  console.log('=== TEST 1: GET /api/jobs/:id ===');
  try {
    const r1 = await get(`/api/jobs/${JOB_ID}`);
    console.log('Status:', r1.status);
    console.log('success:', r1.body.success);
    console.log('jobTitle:', r1.body.data?.jobTitle);
    console.log('candidateCount:', r1.body.data?.candidateCount);
    console.log('has _id:', !!r1.body.data?._id);
  } catch (e) { console.log('ERROR:', e.message); }

  console.log('\n=== TEST 2: GET /api/jobs/:id (invalid ID) ===');
  try {
    const r2 = await get('/api/jobs/invalid-id');
    console.log('Status:', r2.status);
    console.log('success:', r2.body.success);
    console.log('message:', r2.body.message);
  } catch (e) { console.log('ERROR:', e.message); }

  console.log('\n=== TEST 3: GET /api/jobs/:id (non-existent) ===');
  try {
    const r3 = await get('/api/jobs/000000000000000000000000');
    console.log('Status:', r3.status);
    console.log('success:', r3.body.success);
    console.log('message:', r3.body.message);
  } catch (e) { console.log('ERROR:', e.message); }

  console.log('\n=== TEST 4: GET /api/recruitment/candidates?jobId=xxx ===');
  try {
    const r4 = await get(`/api/recruitment/candidates?jobId=${JOB_ID}`);
    console.log('Status:', r4.status);
    console.log('success:', r4.body.success);
    console.log('count:', r4.body.count);
    console.log('data is array:', Array.isArray(r4.body.data));
    if (r4.body.data?.[0]) console.log('first candidate name:', r4.body.data[0].name);
  } catch (e) { console.log('ERROR:', e.message); }

  console.log('\n=== TEST 5: GET /api/recruitment/candidates (no jobId) ===');
  try {
    const r5 = await get('/api/recruitment/candidates');
    console.log('Status:', r5.status);
    console.log('success:', r5.body.success);
    console.log('message:', r5.body.message);
  } catch (e) { console.log('ERROR:', e.message); }

  console.log('\n=== ALL TESTS COMPLETE ===');
})();
