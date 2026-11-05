const tls = require('tls');
const https = require('https');

async function testTLS(version) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'test.cept.gov.in',
      port: 443,
      path: '/beextcustomer/v1/access/login',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(JSON.stringify({username:'9999367287',password:'Dop@1234'})),
      },
      rejectUnauthorized: false,
      secureProtocol: version,
      ciphers: 'ALL:@SECLEVEL=0',
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        resolve({ success: true, status: res.statusCode, body, version });
      });
    });

    req.on('error', (e) => {
      resolve({ success: false, error: e.message, version });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout', version });
    });

    req.write(JSON.stringify({username:'9999367287',password:'Dop@1234'}));
    req.end();
  });
}

(async () => {
  const versions = ['TLSv1_2_method', 'TLSv1_3_method', 'TLSv1_method'];
  for (const v of versions) {
    console.log(`\nTesting ${v}...`);
    const result = await testTLS(v);
    if (result.success) {
      console.log(`SUCCESS! Status: ${result.status}`);
      console.log(`Body: ${result.body}`);
      break;
    } else {
      console.log(`Failed: ${result.error}`);
    }
  }
})();