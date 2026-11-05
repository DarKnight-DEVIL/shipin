// Using Node.js built-in fetch (available in v22+)
async function getToken() {
  try {
    console.log('Attempting with built-in fetch...');
    const response = await fetch('https://test.cept.gov.in/beextcustomer/v1/access/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: '9999367287', password: 'Dop@1234' }),
    });

    const text = await response.text();
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Headers:', Object.fromEntries(response.headers.entries()));
    console.log('Body:', text);
    return { success: true, status: response.status, body: text };
  } catch (err) {
    console.error('Fetch error:', err.message);
    return { success: false, error: err.message };
  }
}

getToken();