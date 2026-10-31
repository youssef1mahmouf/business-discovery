const { hashPassword, verifyPassword, signToken, normalizeRole } = require('../services/auth');
const { sendJson, parseBody } = require('../middleware/http');
const { rateLimit } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;

  router.post('/api/auth/register', async (req, res) => {
    if (!rateLimit(req, res, 60000, 20)) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    const users = ctx.db.get('users');
    const role = email === 'youssef1mahmouf24@gmail.com' ? 'main_super_admin' : 'regular_user';
    const user = { email, passwordHash: hashPassword(password), role, createdAt: new Date().toISOString() };
    try {
      const r = await users.insertOne(user);
      user._id = r.insertedId;
    } catch (e) {
      if (e && e.code === 11000) return sendJson(res, 409, { error: 'email_in_use' }, origin);
      throw e;
    }
    const token = signToken({ sub: String(user._id), email: user.email, role: normalizeRole(user) }, ctx.config.tokenSecret);
    return sendJson(res, 200, { token, user: { id: String(user._id), email: user.email, role: normalizeRole(user) } }, origin);
  });

  router.post('/api/auth/login', async (req, res) => {
    if (!rateLimit(req, res, 60000, 20)) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const users = ctx.db.get('users');
    const user = await users.findOne({ email });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendJson(res, 401, { error: 'invalid_credentials' }, origin);
    }
    const role = normalizeRole(user);
    const token = signToken({ sub: String(user._id), email: user.email, role }, ctx.config.tokenSecret);
    return sendJson(res, 200, { token, user: { id: String(user._id), email: user.email, role } }, origin);
  });

  router.get('/api/auth/me', async (req, res) => {
    const user = requireAuth(req, res, ctx, origin);
    if (!user) return;
    return sendJson(res, 200, { user }, origin);
  });

  router.post('/api/auth/logout', async (req, res) => {
    return sendJson(res, 200, { ok: true }, origin);
  });
}

module.exports = { register };
