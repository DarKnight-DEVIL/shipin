const https = require('https');
const http = require('http');

const data = JSON.stringify({username: '9999999999', password: 'Dop@1234'});

// Test 1: HTTP (port 80)
console.log('=== Test 1: HTTP (port 80) ===');
const httpReq = http.request({
  hostname: 'test.cept.gov.in',
  port: 80,
  path: '/beextcustomer/v1/access/login',
  method: 'POST',
  headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data)}
}, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Body:', body);
    test2();
  });
});
httpReq.on('error', (e) => { console.log('HTTP Error:', e.message); test2(); });
httpReq.setTimeout(10000, () => { console.log('HTTP Timeout'); httpReq.destroy(); test2(); });
httpReq.write(data);
httpReq.end();

function test2() {
  console.log('\n=== Test 2: HTTPS with TLS 1.2 ===');
  const options = {
    hostname: 'test.cept.gov.in',
    port: 443,
    path: '/beextcustomer/v1/access/login',
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data)},
    secureProtocol: 'TLSv1_2_method',
    rejectUnauthorized: false
  };
  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Body:', body);
    });
  });
  req.on('error', (e) => { console.log('HTTPS Error:', e.message); });
  req.setTimeout(10000, () => { console.log('HTTPS Timeout'); req.destroy(); });
  req.write(data);
  req.end();
}