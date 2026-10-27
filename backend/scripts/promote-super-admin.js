const { MongoClient } = require('mongodb');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function getArg(name) {
  const prefix = '--' + name + '=';
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

async function main() {
  const email = getArg('email');
  if (!email) {
    console.error('Usage: node scripts/promote-super-admin.js --email=user@example.com');
    process.exit(1);
  }

  const mongoUri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'business_discovery';
  if (!mongoUri) {
    console.error('MONGODB_URI is required');
    process.exit(1);
  }

  const client = new MongoClient(mongoUri);
  await client.connect();
  try {
    const db = client.db(dbName);
    const users = db.collection('users');
    const normalizedEmail = String(email).toLowerCase();
    const user = await users.findOne({ email: normalizedEmail });
    if (!user) {
      console.error('No user found for the provided email.');
      process.exit(1);
    }

    await users.updateOne(
      { _id: user._id },
      { $set: { role: 'site_admin', updatedAt: new Date().toISOString() } }
    );
    console.log('Super-admin role assigned successfully.');
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error('Promotion failed:', error && error.message ? error.message : 'Error');
  process.exit(1);
});