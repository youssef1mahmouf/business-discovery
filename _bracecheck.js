const fs = require('fs');
const s = fs.readFileSync('d:/Linux-Transfer/Code/business-discovery/backend/src/server.js','utf8');
const lines = s.split(/\r?\n/);
let depth = 0;
for (let i = 0; i < lines.length; i++) {
  const l = lines[i];
  for (const c of l) { if (c === '{') depth++; if (c === '}') depth--; }
  if (i + 1 === 194) console.log('depth after line 194:', depth);
  if (i + 1 === 336) console.log('depth after line 336:', depth);
}
console.log('final depth', depth);
