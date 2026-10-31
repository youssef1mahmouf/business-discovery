const { loadEnvFile, validateConfig } = require('../src/config');
const db = require('../src/db/mongo');

function getProvisionEmail(env = process.env) {
  const email = String((env && (env.ADMIN_EMAIL || env.MAIN_SUPER_ADMIN_EMAIL)) || '').trim().toLowerCase();
  if (!email) {
    throw new Error('ADMIN_EMAIL is required');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address');
  }
  return email;
}

async function main() {
  loadEnvFile();
  const config = validateConfig();
  const email = getProvisionEmail(process.env);
  if (String(process.env.ADMIN_PROVISION_CONFIRM || '').toLowerCase() !== 'yes') {
    throw new Error('ADMIN_PROVISION_CONFIRM must be set to yes');
  }

  const conn = await db.connect(config);
  try {
    const users = conn.collections.users;
    const result = await users.updateOne(
      { email },
      { $set: { role: 'main_super_admin', updatedAt: new Date().toISOString() } }
    );
    console.log('matched:', result.matchedCount, 'modified:', result.modifiedCount);
    if (result.matchedCount === 0) {
      console.error('No existing user found for the configured administrator email.');
      process.exitCode = 1;
    }
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Provisioning failed:', e && e.message ? e.message : e);
    process.exit(1);
  });
}

module.exports = { getProvisionEmail };
