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

  const ttlRaw = env.ACCESS_TOKEN_TTL_SECONDS;
  let accessTokenTtlSeconds = 900;
  if (ttlRaw !== undefined && String(ttlRaw).trim() !== '') {
    const n = Number(ttlRaw);
    if (!Number.isInteger(n) || n < 60 || n > 86400) {
      errors.push('ACCESS_TOKEN_TTL_SECONDS must be an integer between 60 and 86400');
    } else {
      accessTokenTtlSeconds = n;
    }
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

  // Email configuration (optional; required for password recovery).
  const emailProvider = String(env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase();
  if (!['smtp', 'brevo'].includes(emailProvider)) {
    const e = new Error('EMAIL_PROVIDER must be smtp or brevo');
    e.name = 'ConfigValidationError';
    throw e;
  }
  const smtpConfig = {
    provider: emailProvider,
    apiKey: String(env.BREVO_API_KEY || '').trim(),
    fromEmail: String(env.BREVO_FROM_EMAIL || '').trim(),
    fromName: String(env.BREVO_FROM_NAME || '').trim(),
    host: String(env.SMTP_HOST || '').trim(),
    port: Number(env.SMTP_PORT || 587),
    user: String(env.SMTP_USER || '').trim(),
    pass: String(env.SMTP_PASS || '').trim(),
    from: String(env.SMTP_FROM || '').trim(),
  };

  const dbName = String(env.MONGODB_DB_NAME || '').trim() || 'business_discovery';
  const fallbackDirectory = String(
    env.JSON_FALLBACK_DIR || path.join(__dirname, '..', 'data', 'fallback')
  ).trim();
  const jsonFallbackDir = path.isAbsolute(fallbackDirectory)
    ? fallbackDirectory
    : path.resolve(__dirname, '..', '..', fallbackDirectory);
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port <= 0) {
    const e = new Error('PORT must be a positive integer');
    e.name = 'ConfigValidationError';
    throw e;
  }
  const ollamaBaseUrl = String(env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').trim().replace(/\/+$/, '');
  let ollamaUrl;
  try { ollamaUrl = new URL(ollamaBaseUrl); } catch {
    const e = new Error('OLLAMA_BASE_URL must be a valid HTTP(S) URL');
    e.name = 'ConfigValidationError';
    throw e;
  }
  if (!['http:', 'https:'].includes(ollamaUrl.protocol) || ollamaUrl.username || ollamaUrl.password) {
    const e = new Error('OLLAMA_BASE_URL must be a valid HTTP(S) URL without embedded credentials');
    e.name = 'ConfigValidationError';
    throw e;
  }
  const ollamaModel = String(env.OLLAMA_MODEL || 'qwen3:4b').trim();
  if (!ollamaModel || ollamaModel.length > 100) {
    const e = new Error('OLLAMA_MODEL must contain 1 to 100 characters');
    e.name = 'ConfigValidationError';
    throw e;
  }
  const ollamaTimeoutMs = Number(env.OLLAMA_TIMEOUT_MS || 45000);
  if (!Number.isInteger(ollamaTimeoutMs) || ollamaTimeoutMs < 1000 || ollamaTimeoutMs > 120000) {
    const e = new Error('OLLAMA_TIMEOUT_MS must be between 1000 and 120000');
    e.name = 'ConfigValidationError';
    throw e;
  }
  return {
    port,
    mongoUri,
    tokenSecret: String(tokenSecret),
    frontendOrigin: String(frontendOrigin),
    dbName,
    jsonFallbackDir,
    production,
    accessTokenTtlSeconds,
    smtpConfig,
    ollamaBaseUrl,
    ollamaModel,
    ollamaTimeoutMs
  };
}

module.exports = { loadEnvFile, validateConfig, ROOT, REPO_ROOT };
