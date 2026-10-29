const { loadEnvFile, validateConfig } = require('../src/config');
const db = require('../src/db/mongo');
const fs = require('fs');
const path = require('path');

async function main() {
  loadEnvFile();
  const config = validateConfig();
  const conn = await db.connect(config);
  const idxPath = path.join(__dirname, '..', '..', 'database', 'indexes.json');
  const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
  for (const i of idx) {
    const c = conn.collections[i.collection] || conn.db.collection(i.collection);
    await c.createIndex(i.keys, { unique: !!i.unique, background: true });
    console.log('index ensured:', i.collection, JSON.stringify(i.keys));
  }
  await db.close();
  console.log('DB init complete (no data deleted).');
}
main().catch(e => { console.error(e); process.exit(1); });
