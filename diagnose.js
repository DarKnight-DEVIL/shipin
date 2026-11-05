const net = require('net');
const tls = require('tls');
const https = require('https');

console.log('=== Step 1: TCP Connection Test ===');
const socket = net.connect(443, 'test.cept.gov.in', () => {
  console.log('TCP connection established!');

  console.log('\n=== Step 2: TLS Handshake Test ===');
  const tlsSocket = tls.connect(443, 'test.cept.gov.in', {
    rejectUnauthorized: false,
    secureProtocol: 'TLSv1_2_method',
  }, () => {
    console.log('TLS handshake successful!');
    console.log('TLS Version:', tlsSocket.getProtocol());
    console.log('Cipher:', tlsSocket.getCipher());

    console.log('\n=== Step 3: HTTPS POST Request ===');
    const data = JSON.stringify({ username: '9999367287', password: 'Dop@1234' });
    const headers = [
      'POST /beextcustomer/v1/access/login HTTP/1.1',
      'Host: test.cept.gov.in',
      'Content-Type: application/json',
      `Content-Length: Buffer.byteLength(data)}`,
      'Connection: close',
      '',
      '',
    ].join('\r\n');

    tlsSocket.write(headers + data);
  });

  tlsSocket.on('data', (data) => {
    console.log('Response received:');
    console.log(data.toString());
    tlsSocket.end();
  });

  tlsSocket.on('error', (e) => {
    console.error('TLS Error:', e.message);
  });

  tlsSocket.on('close', () => {
    console.log('\nConnection closed');
  });

  socket.end();
});

socket.on('error', (e) => {
  console.error('TCP Error:', e.message);
});

socket.setTimeout(10000, () => {
  console.log('TCP Timeout');
  socket.destroy();
});