const fs = require('fs');
const p = 'index.html';
let s = fs.readFileSync(p, 'utf8');
const old = "if (!/^[^\\\\s@]+@[^\\\\s@]+\\\\.[^\\\\s@]+$/.test(email))";
const neu = "if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email))";
console.log('old found:', s.includes(old));
s = s.replace(old, neu);
fs.writeFileSync(p, s, 'utf8');
console.log('done');
