const { loadEnvFile, validateConfig } = require('../src/config');
const db = require('../src/db/mongo');
const ADMIN_EMAIL = 'youssef1mahmouf24@gmail.com';

async function main() {
  loadEnvFile();
  const config = validateConfig();
  const conn = await db.connect(config);
  const users = conn.collections.users;

  const res = await users.updateOne({ email: ADMIN_EMAIL }, { $set: { role: 'site_admin' } });
  console.log('matched:', res.matchedCount, 'modified:', res.modifiedCount);
  await db.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
