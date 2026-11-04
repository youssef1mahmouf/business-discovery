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
    const role = 'regular_user';
    const user = { email, passwordHash: hashPassword(password), role, createdAt: new Date().toISOString() };
    try {
      const r = await users.insertOne(user);
      user._id = r.insertedId;
    } catch (e) {
      if (e && e.code === 11000) return sendJson(res, 409, { error: 'email_in_use' }, origin);
      throw e;
    }
    const token = signToken({ sub: String(user._id), email: user.email, role: normalizeRole(user) }, ctx.config.tokenSecret, ctx.config.accessTokenTtlSeconds);
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
    const token = signToken({ sub: String(user._id), email: user.email, role }, ctx.config.tokenSecret, ctx.config.accessTokenTtlSeconds);
    return sendJson(res, 200, { token, user: { id: String(user._id), email: user.email, role } }, origin);
  });

  router.post('/api/auth/password-recovery', async (req, res) => {
    if (!rateLimit(req, res, 60000, 20)) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    const users = ctx.db.get('users');
    const user = await users.findOne({ email });
    if (!user) {
      // Generic response - do not reveal whether email exists
      return sendJson(res, 200, { ok: true });
    }
    // Generate a cryptographically secure random token
    const crypto = require('crypto');
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    // Store the hashed token in user_states collection
    const userStates = ctx.db.get('user_states');
    await userStates.insertOne({ email: user.email, token, expiresAt: tokenExpires, used: false });
    // Generic response - do not reveal whether email exists
    return sendJson(res, 200, { ok: true });
  });

  router.post('/api/auth/reset-password', async (req, res) => {
    if (!rateLimit(req, res, 60000, 20)) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    const { token, newPassword } = body;
    if (!token || !newPassword || newPassword.length < 8) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    const crypto = require('crypto');
    // Hash the token for lookup
    const hashedToken = crypto.createHash('sha256').update(token).digest('base64url');
    const userStates = ctx.db.get('user_states');
    const record = await userStates.findOne({ token: hashedToken, used: false });
    if (!record) {
      return sendJson(res, 400, { error: 'invalid_or_expired_token' }, origin);
    }
    if (new Date() > new Date(record.expiresAt)) {
      // Mark as used/expired
      await userStates.updateOne({ token: hashedToken }, { $set: { used: true } });
      return sendJson(res, 400, { error: 'invalid_or_expired_token' }, origin);
    }
    // Mark token as used
    await userStates.updateOne({ token: hashedToken }, { $set: { used: true } });
    // Hash the new password and update user
    const passwordHash = hashPassword(newPassword);
    const users = ctx.db.get('users');
    await users.updateOne({ email: record.email }, { $set: { passwordHash, updatedAt: new Date().toISOString() } });
    return sendJson(res, 200, { ok: true });
  });

  router.get('/api/auth/me', async (req, res) => {
    const user = await requireAuth(req, res, ctx, origin);
    if (!user) return;
    return sendJson(res, 200, { user }, origin);
  });

  router.post('/api/auth/logout', async (req, res) => {
    // Client-side token removal only. Server-side revocation is not implemented
    // in this phase; stolen tokens remain valid until exp. See docs/revocation.md.
    return sendJson(res, 200, { ok: true }, origin);
  });
}

module.exports = { register };
