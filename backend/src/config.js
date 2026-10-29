const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..', '..');
const REPO_ROOT = path.join(ROOT, '..');

function loadEnvFile() {
  const candidates = [
    path.join(ROOT, '.env'),           // repo root
    path.join(ROOT, 'backend', '.env'), // backend
    path.join(REPO_ROOT, '.env')
  ];
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
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
}

function validateConfig(env = process.env) {
  const errors = [];
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) errors.push('MONGODB_URI is required');
  else if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) errors.push('MONGODB_URI must be a valid MongoDB connection string');

  const production = String(env.NODE_ENV || 'development') === 'production';
  let tokenSecret = env.TOKEN_SECRET;
  if (production) {
    if (!tokenSecret) errors.push('TOKEN_SECRET is required in production');
    else if (tokenSecret === 'dev-only-change-me') errors.push('TOKEN_SECRET must not use the insecure development default');
    else if (String(tokenSecret).length < 32) errors.push('TOKEN_SECRET must be at least 32 characters in production');
  } else if (!tokenSecret) {
    tokenSecret = 'dev-only-change-me';
  }

  let frontendOrigin = env.FRONTEND_ORIGIN;
  if (production) {
    if (!frontendOrigin || frontendOrigin === '*') errors.push('FRONTEND_ORIGIN must be explicitly configured in production');
  } else if (!frontendOrigin) {
    frontendOrigin = '*';
  }

  if (errors.length) {
    const e = new Error(errors.join('; '));
    e.name = 'ConfigValidationError';
    throw e;
  }

  const dbName = String(env.MONGODB_DB_NAME || '').trim() || 'business_discovery';
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port <= 0) {
    const e = new Error('PORT must be a positive integer');
    e.name = 'ConfigValidationError';
    throw e;
  }
  return { port, mongoUri, tokenSecret: String(tokenSecret), frontendOrigin: String(frontendOrigin), dbName, production };
}

module.exports = { loadEnvFile, validateConfig, ROOT, REPO_ROOT };
