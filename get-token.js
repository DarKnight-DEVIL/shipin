const https = require('https');

async function getToken(username, password) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username, password });
    const options = {
      hostname: 'test.cept.gov.in',
      path: '/beextcustomer/v1/access/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      rejectUnauthorized: false,
      timeout: 15000,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(data);
    req.end();
  });
}

(async () => {
  // Try your actual username first
  console.log('Trying username: 9999367287');
  try {
    const result = await getToken('9999367287', 'Dop@1234');
    console.log('Status:', result.status);
    console.log('Body:', result.body);
  } catch (e) {
    console.error('Error:', e.message);

    // Fallback to sample credentials
    console.log('\nTrying sample username: 9999999999');
    try {
      const result = await getToken('9999999999', 'Dop@1234');
      console.log('Status:', result.status);
      console.log('Body:', result.body);
    } catch (e2) {
      console.error('Error:', e2.message);
    }
  }
})();