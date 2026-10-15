const fs = require('fs');
const path = 'c:/Users/darkn/shipin/landing-page.html';
console.log('starting write to', path);
const content = `test content`;
fs.writeFileSync(path, content, 'utf8');
console.log('done');
