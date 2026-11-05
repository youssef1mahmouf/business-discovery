const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { sendJson, parseBody } = require('../middleware/http');
const { requireAuth } = require('../middleware/auth');
const { PROFILE_FIELDS, normalizeProfile } = require('../services/profile');

function hashShareToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const users = ctx.db.get('users');

  router.get('/api/profile', async (req, res) => {
    const user = await requireAuth(req, res, ctx, origin);
    if (!user) return;
    const account = await users.findOne({ _id: new ObjectId(user.id) });
    if (!account) return sendJson(res, 404, { error: 'not_found' }, origin);
    return sendJson(res, 200, {
      profile: { ...(account.profile || {}), username: account.username || account.profile && account.profile.username || '' },
      shareEnabled: !!account.profileShareTokenHash
    }, origin);
  });

  router.put('/api/profile', async (req, res) => {
    const user = await requireAuth(req, res, ctx, origin);
    if (!user) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    if (!body || typeof body !== 'object' || Array.isArray(body) ||
        Object.keys(body).some((key) => !PROFILE_FIELDS.includes(key))) {
      return sendJson(res, 400, { error: 'invalid_input' }, origin);
    }
    const profile = normalizeProfile(body);
    if (!profile || !profile.displayName) return sendJson(res, 400, { error: 'invalid_input' }, origin);
    try {
      await users.updateOne(
        { _id: new ObjectId(user.id) },
        { $set: {
          profile,
          displayName: profile.displayName,
          ...(profile.username ? { username: profile.username } : {}),
          profileUpdatedAt: new Date().toISOString()
        } }
      );
    } catch (error) {
      if (error && error.code === 11000) return sendJson(res, 409, { error: 'username_in_use' }, origin);
      throw error;
    }
    return sendJson(res, 200, { profile }, origin);
  });

  router.post('/api/profile/share', async (req, res) => {
    const user = await requireAuth(req, res, ctx, origin);
    if (!user) return;
    const token = crypto.randomBytes(32).toString('base64url');
    await users.updateOne(
      { _id: new ObjectId(user.id) },
      { $set: { profileShareTokenHash: hashShareToken(token), profileShareUpdatedAt: new Date().toISOString() } }
    );
    return sendJson(res, 200, { shareUrl: 'profile.html?share=' + encodeURIComponent(token) }, origin);
  });

  router.delete('/api/profile/share', async (req, res) => {
    const user = await requireAuth(req, res, ctx, origin);
    if (!user) return;
    await users.updateOne(
      { _id: new ObjectId(user.id) },
      { $unset: { profileShareTokenHash: '', profileShareUpdatedAt: '' } }
    );
    return sendJson(res, 200, { ok: true }, origin);
  });

  router.get('/api/public/profiles/:shareToken', async (req, res) => {
    const token = String(req.params.shareToken || '');
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return sendJson(res, 404, { error: 'not_found' }, origin);
    const account = await users.findOne({ profileShareTokenHash: hashShareToken(token) });
    if (!account || !account.profile) return sendJson(res, 404, { error: 'not_found' }, origin);
    return sendJson(res, 200, { profile: account.profile }, origin);
  });
}

module.exports = { register };
