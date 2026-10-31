const { verifyToken } = require('../services/auth');
const { ObjectId } = require('mongodb');

function oid(v) { try { return new ObjectId(v); } catch { return null; } }

async function authenticate(req, ctx) {
  const token = (req.headers.authorization || '').startsWith('Bearer ')
    ? req.headers.authorization.slice(7) : null;
  if (!token) return null;
  const payload = verifyToken(token, ctx.config.tokenSecret);
  if (!payload || !payload.sub) return null;

  const id = oid(payload.sub);
  if (!id) return null;

  let user;
  try {
    user = await ctx.db.get('users').findOne({ _id: id });
  } catch {
    return null;
  }
  if (!user) return null;

  const { normalizeRole } = require('../services/auth');
  // Database role is the source of truth; token claims are never trusted for authorization.
  const role = normalizeRole(user);
  if (payload.email && String(payload.email).toLowerCase() !== String(user.email || '').toLowerCase()) {
    // Token subject/email mismatch: reject stale or tampered tokens.
    return null;
  }
  return { id: String(user._id), email: user.email, role };
}

async function requireAuth(req, res, ctx, origin) {
  const user = await authenticate(req, ctx);
  if (!user) {
    const { sendJson } = require('./http');
    sendJson(res, 401, { error: 'unauthorized' }, origin);
    return null;
  }
  return user;
}

const { isSiteAdminRole } = require('../services/auth');
async function requireAdmin(req, res, ctx, origin) {
  const user = await requireAuth(req, res, ctx, origin);
  if (!user) return null;
  if (!isSiteAdminRole(user)) {
    const { sendJson } = require('./http');
    sendJson(res, 403, { error: 'forbidden' }, origin);
    return null;
  }
  return user;
}

module.exports = { authenticate, requireAuth, requireAdmin };
