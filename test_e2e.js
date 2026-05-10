async function test() {
  const jobRes = await fetch('http://localhost:3000/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      job_title: ['Software Engineer'],
      location: ['San Francisco'],
      email_required: false,
      per_page: 5
    })
  });
  const job = await jobRes.json();
  console.log('JOB ID:', job.data._id);
  
  try {
     const leadsRes = await fetch('http://localhost:3000/api/recruitment/search', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
         jobId: job.data._id
       })
     });
     const leads = await leadsRes.json();
     console.log('Leads count:', leads.data.length);
     console.log('Sample:', leads.data[0]);
  } catch (err) {
     console.log('Error:', err);
  }
}

test();
