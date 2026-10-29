const crypto = require('crypto');

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

function signToken(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return data + '.' + crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function verifyToken(token, secret) {
  const [data, signature] = String(token || '').split('.');
  if (!data || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function normalizeRole(userOrRole) {
  if (userOrRole && typeof userOrRole === 'object' && String(userOrRole.email || '').toLowerCase() === 'youssef1mahmouf24@gmail.com') {
    return 'main_super_admin';
  }
  const role = typeof userOrRole === 'string'
    ? userOrRole
    : (userOrRole && typeof userOrRole === 'object' ? userOrRole.role : null);
  if (role === 'main_super_admin' || role === 'site_admin') return role;
  return 'regular_user';
}
function isSiteAdminRole(roleOrUser) {
  const r = normalizeRole(roleOrUser);
  return r === 'site_admin' || r === 'main_super_admin';
}
function isMainSuperAdmin(roleOrUser) {
  return normalizeRole(roleOrUser) === 'main_super_admin';
}
module.exports = { hashPassword, verifyPassword, signToken, verifyToken, normalizeRole, isSiteAdminRole, isMainSuperAdmin };


