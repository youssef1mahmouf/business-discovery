const crypto = require('crypto');

const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
  } catch {
    return false;
  }
}

function signToken(payload, secret, ttlSeconds = DEFAULT_ACCESS_TOKEN_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Number.isFinite(ttlSeconds) && ttlSeconds > 0 ? Math.floor(ttlSeconds) : DEFAULT_ACCESS_TOKEN_TTL_SECONDS;
  const body = Object.assign({}, payload, {
    iat: now,
    exp: now + ttl
  });
  const data = Buffer.from(JSON.stringify(body)).toString('base64url');
  return data + '.' + crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function verifyToken(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  if (!data || !signature) return null;

  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  try {
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (!Number.isFinite(payload.iat) || !Number.isFinite(payload.exp)) return null;
  if (payload.exp <= payload.iat) return null;
  if (!Number.isFinite(nowSeconds)) return null;
  if (nowSeconds >= payload.exp) return null;
  if (payload.iat > nowSeconds + 60) return null;
  return payload;
}

function normalizeRole(userOrRole) {
  const raw = typeof userOrRole === 'string'
    ? userOrRole
    : (userOrRole && typeof userOrRole === 'object' ? userOrRole.role : null);
  if (raw === 'main_super_admin' || raw === 'site_admin') return raw;
  return 'regular_user';
}

function isSiteAdminRole(roleOrUser) {
  return normalizeRole(roleOrUser) === 'site_admin' || normalizeRole(roleOrUser) === 'main_super_admin';
}

function isMainSuperAdmin(roleOrUser) {
  return normalizeRole(roleOrUser) === 'main_super_admin';
}

module.exports = {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  normalizeRole,
  isSiteAdminRole,
  isMainSuperAdmin,
  DEFAULT_ACCESS_TOKEN_TTL_SECONDS
};


