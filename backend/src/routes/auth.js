const { hashPassword, verifyPassword, signToken, normalizeRole } = require('../services/auth');
const { sendJson, parseBody } = require('../middleware/http');
const { rateLimit } = require('../middleware/rateLimit');
const { requireAuth } = require('../middleware/auth');
const { normalizeProfile } = require('../services/profile');

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;

  router.post('/api/auth/register', async (req, res) => {
    if (!rateLimit(req, res, 60000, 20)) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    let username;
    let profile;
    if (body.username !== undefined || body.profile !== undefined) {
      username = String(body.username || body.profile && body.profile.username || '').trim().toLowerCase();
      if (!/^[a-z0-9_]{3,30}$/.test(username)) return sendJson(res, 400, { error: 'invalid_username' }, origin);
      profile = normalizeProfile({ ...(body.profile || {}), username });
      if (!profile || !profile.displayName) return sendJson(res, 400, { error: 'invalid_profile' }, origin);
    }
    const users = ctx.db.get('users');
    const role = 'regular_user';
    const user = {
      email,
      passwordHash: hashPassword(password),
      role,
      ...(username ? { username, displayName: profile.displayName, profile } : {}),
      createdAt: new Date().toISOString()
    };
    try {
      const r = await users.insertOne(user);
      user._id = r.insertedId;
    } catch (e) {
      if (e && e.code === 11000) {
        return sendJson(res, 409, { error: e.keyPattern && e.keyPattern.username ? 'username_in_use' : 'email_in_use' }, origin);
      }
      throw e;
    }
    const token = signToken({ sub: String(user._id), email: user.email, role: normalizeRole(user) }, ctx.config.tokenSecret, ctx.config.accessTokenTtlSeconds);
    return sendJson(res, 200, { token, user: { id: String(user._id), email: user.email, username: user.username, role: normalizeRole(user) } }, origin);
  });

  router.post('/api/auth/login', async (req, res) => {
    if (!rateLimit(req, res, 60000, 20)) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    const identifier = String(body.identifier || body.email || body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const users = ctx.db.get('users');
    const user = await users.findOne({
      $or: [{ email: identifier }, { username: identifier }]
    });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return sendJson(res, 401, { error: 'invalid_credentials' }, origin);
    }
    const role = normalizeRole(user);
    const token = signToken({ sub: String(user._id), email: user.email, role }, ctx.config.tokenSecret, ctx.config.accessTokenTtlSeconds);
    return sendJson(res, 200, { token, user: { id: String(user._id), email: user.email, role, mustChangePassword: !!user.mustChangePassword } }, origin);
  });

  router.post('/api/auth/password-recovery', async (req, res) => {
    if (!rateLimit(req, res, 60000, 20)) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    const users = ctx.db.get('users');
    const user = await users.findOne({ email });
    if (!user) {
      // Generic response - do not reveal whether email exists
      return sendJson(res, 200, { ok: true });
    }
    // Generate a 6-digit verification code
    const crypto = require('crypto');
    const code = crypto.randomInt(100000, 999999).toString();
    const codeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    // Store the hashed verification code in user_states
    const hashedCode = crypto.createHash('sha256').update(code).digest('base64url');
    const userStates = ctx.db.get('user_states');
    await userStates.insertOne({ email: user.email, code: hashedCode, expiresAt: codeExpires, used: false, type: 'recovery' });
    // Send the verification code by email
    const { createSmtpClient } = require('../services/mail');
    const smtp = createSmtpClient(ctx.config.smtpConfig);
    try {
      await smtp.send({
        to: user.email,
        subject: 'Business Discovery - Password Recovery Verification Code',
        text: 'Your verification code is: ' + code + '\nThis code expires in 15 minutes.',
      });
    } catch (mailErr) {
      // Log but do not fail - generic response to avoid revealing email status
      console.error('Email delivery failed:', mailErr && mailErr.message ? mailErr.message : mailErr);
    }
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

  router.post('/api/auth/reset-password-with-code', async (req, res) => {
    if (!rateLimit(req, res, 60000, 10)) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '');
    const newPassword = String(body.newPassword || '');
    const confirmPassword = String(body.confirmPassword || '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code) || newPassword.length < 8) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    if (newPassword !== confirmPassword) {
      return sendJson(res, 400, { error: 'passwords_do_not_match' }, origin);
    }

    const crypto = require('crypto');
    const hashedCode = crypto.createHash('sha256').update(code).digest('base64url');
    const userStates = ctx.db.get('user_states');
    const filter = { email, code: hashedCode, used: false, type: 'recovery' };
    const record = await userStates.findOne(filter);
    if (!record) return sendJson(res, 400, { error: 'invalid_or_expired_code' }, origin);
    const expiresAt = new Date(record.expiresAt).getTime();
    if (!Number.isFinite(expiresAt) || Date.now() >= expiresAt) {
      await userStates.updateOne(filter, { $set: { used: true } });
      return sendJson(res, 400, { error: 'invalid_or_expired_code' }, origin);
    }

    const consumed = await userStates.updateOne(filter, { $set: { used: true } });
    if (!consumed.matchedCount) {
      return sendJson(res, 400, { error: 'invalid_or_expired_code' }, origin);
    }
    await ctx.db.get('users').updateOne({ email }, {
      $set: {
        passwordHash: hashPassword(newPassword),
        mustChangePassword: false,
        updatedAt: new Date().toISOString(),
      },
    });
    await userStates.updateMany({ email, type: 'recovery', used: false }, { $set: { used: true } });
    return sendJson(res, 200, { ok: true });
  });

  // Verify recovery code and issue a short-lived verification token
  router.post('/api/auth/verify-recovery-code', async (req, res) => {
    if (!rateLimit(req, res, 60000, 10)) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    const email = String(body.email || '').trim().toLowerCase();
    const code = String(body.code || '');
    if (!email || !/^\d{6}$/.test(code)) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    const crypto = require('crypto');
    const hashedCode = crypto.createHash('sha256').update(code).digest('base64url');
    const userStates = ctx.db.get('user_states');
    const record = await userStates.findOne({ email, code: hashedCode, used: false, type: 'recovery' });
    if (!record) {
      return sendJson(res, 400, { error: 'invalid_or_expired_code' }, origin);
    }
    if (new Date() > new Date(record.expiresAt)) {
      await userStates.updateOne({ email, code: hashedCode }, { $set: { used: true } });
      return sendJson(res, 400, { error: 'invalid_or_expired_code' }, origin);
    }
    // Mark code as used
    await userStates.updateOne({ email, code: hashedCode }, { $set: { used: true } });
    // Issue short-lived verification token (5 minutes) for temp password generation
    const verifyToken = signToken(
      { sub: email, type: 'recovery-verify' },
      ctx.config.tokenSecret,
      5 * 60
    );
    return sendJson(res, 200, { token: verifyToken }, origin);
  });

  // Generate a temporary password after successful code verification
  router.post('/api/auth/generate-temp-password', async (req, res) => {
    if (!rateLimit(req, res, 60000, 5)) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    const token = String(body.token || '');
    if (!token) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    const payload = verifyToken(token, ctx.config.tokenSecret);
    if (!payload || payload.type !== 'recovery-verify') {
      return sendJson(res, 401, { error: 'invalid_or_expired_token' }, origin);
    }
    const email = String(payload.sub || '').toLowerCase();
    const users = ctx.db.get('users');
    const user = await users.findOne({ email });
    if (!user) {
      return sendJson(res, 404, { error: 'user_not_found' }, origin);
    }
    // Generate a cryptographically secure temporary password
    const crypto = require('crypto');
    const tempPassword = crypto.randomBytes(12).toString('base64url').slice(0, 16);
    const passwordHash = hashPassword(tempPassword);
    await users.updateOne({ email }, {
      $set: {
        passwordHash,
        mustChangePassword: true,
        updatedAt: new Date().toISOString(),
      },
    });
    // Invalidate any remaining recovery codes for this email
    const userStates = ctx.db.get('user_states');
    await userStates.updateMany({ email, type: 'recovery', used: false }, { $set: { used: true } });
    // Return the temporary password to be displayed once
    return sendJson(res, 200, { temporaryPassword: tempPassword }, origin);
  });

  // Change password (used for forced change after temp password login)
  router.post('/api/auth/change-password', async (req, res) => {
    const user = await requireAuth(req, res, ctx, origin);
    if (!user) return;
    if (!user.mustChangePassword) {
      return sendJson(res, 400, { error: 'password_change_not_required' }, origin);
    }
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    const { oldPassword, newPassword, confirmPassword } = body;
    if (!oldPassword || !newPassword || !confirmPassword) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    if (newPassword !== confirmPassword) {
      return sendJson(res, 400, { error: 'passwords_do_not_match' }, origin);
    }
    if (newPassword.length < 8) {
      return sendJson(res, 400, { error: 'password_too_short' }, origin);
    }
    const users = ctx.db.get('users');
    const dbUser = await users.findOne({ email: user.email });
    if (!dbUser || !verifyPassword(oldPassword, dbUser.passwordHash)) {
      return sendJson(res, 401, { error: 'invalid_credentials' }, origin);
    }
    const passwordHash = hashPassword(newPassword);
    await users.updateOne({ email: user.email }, {
      $set: { passwordHash, mustChangePassword: false, updatedAt: new Date().toISOString() },
    });
    return sendJson(res, 200, { ok: true }, origin);
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
