const { verifyToken } = require('../services/auth');

function authenticate(req, ctx) {
  const token = (req.headers.authorization || '').startsWith('Bearer ')
    ? req.headers.authorization.slice(7) : null;
  if (!token) return null;
  const payload = verifyToken(token, ctx.config.tokenSecret);
  if (!payload) return null;
  return { id: payload.sub, email: payload.email, role: payload.role };
}

function requireAuth(req, res, ctx, origin) {
  const user = authenticate(req, ctx);
  if (!user) {
    const { sendJson } = require('./http');
    sendJson(res, 401, { error: 'unauthorized' }, origin);
    return null;
  }
  return user;
}

const { isSiteAdminRole } = require('../services/auth');
function requireAdmin(req, res, ctx, origin) {
  const user = requireAuth(req, res, ctx, origin);
  if (!user) return null;
  if (!isSiteAdminRole(user)) {
    const { sendJson } = require('./http');
    sendJson(res, 403, { error: 'forbidden' }, origin);
    return null;
  }
  return user;
}

module.exports = { authenticate, requireAuth, requireAdmin };
