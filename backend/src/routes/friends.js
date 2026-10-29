const { sendJson, parseBody } = require('../middleware/http');
const { requireAuth } = require('../middleware/auth');
const { ObjectId } = require('mongodb');

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const fr = ctx.db.get('friend_requests');
  const fs_ = ctx.db.get('friendships');
  const pi = ctx.db.get('partner_invites');
  const ps = ctx.db.get('partnerships');

  router.get('/api/friends', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const items = await fs_.find({ $or: [{ a: u.email },{ b: u.email }] }).toArray();
    const friends = items.map(x => x.a === u.email ? x.b : x.a);
    const pending = await fr.find({ to: u.email, type: 'friend', status: 'pending' }).toArray();
    return sendJson(res,200,{ friends, pending },origin);
  });

  router.post('/api/friends/requests', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    const to = String(body.to||'').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to === u.email) return sendJson(res,400,{error:'invalid_input'},origin);
    try { await fr.insertOne({ from: u.email, to, type: 'friend', status: 'pending', createdAt: new Date().toISOString() }); }
    catch (e) { if (e && e.code===11000) return sendJson(res,409,{error:'already_requested'},origin); throw e; }
    await ctx.db.get('notifications').insertOne({ userEmail: to, type: 'friend_request', from: u.email, createdAt: new Date().toISOString(), read: false });
    return sendJson(res,201,{ ok: true },origin);
  });

  router.post('/api/friends/requests/:id/accept', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const o = new ObjectId(req.params.id);
    const r = await fr.findOne({ _id: o });
    if (!r || r.to !== u.email || r.type !== 'friend' || r.status !== 'pending') return sendJson(res,403,{error:'forbidden'},origin);
    await fr.updateOne({ _id: o }, { $set: { status: 'accepted' } });
    const exists = await fs_.findOne({ $or: [{ a: r.from, b: r.to },{ a: r.to, b: r.from }] });
    if (!exists) await fs_.insertOne({ a: r.from, b: r.to, createdAt: new Date().toISOString() });
    return sendJson(res,200,{ ok: true },origin);
  });

  router.post('/api/friends/requests/:id/reject', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const o = new ObjectId(req.params.id);
    const r = await fr.findOne({ _id: o });
    if (!r || r.to !== u.email || r.type !== 'friend' || r.status !== 'pending') return sendJson(res,403,{error:'forbidden'},origin);
    await fr.updateOne({ _id: o }, { $set: { status: 'rejected' } });
    return sendJson(res,200,{ ok: true },origin);
  });

  router.get('/api/partners', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const items = await ps.find({ $or: [{ a: u.email },{ b: u.email }] }).toArray();
    const partners = items.map(x => x.a === u.email ? x.b : x.a);
    const pending = await pi.find({ to: u.email, type: 'partner', status: 'pending' }).toArray();
    return sendJson(res,200,{ partners, pending },origin);
  });

  router.post('/api/partners/invitations', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    const to = String(body.to||'').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || to === u.email) return sendJson(res,400,{error:'invalid_input'},origin);
    try { await pi.insertOne({ from: u.email, to, type: 'partner', status: 'pending', createdAt: new Date().toISOString() }); }
    catch (e) { if (e && e.code===11000) return sendJson(res,409,{error:'already_invited'},origin); throw e; }
    await ctx.db.get('notifications').insertOne({ userEmail: to, type: 'partner_invite', from: u.email, createdAt: new Date().toISOString(), read: false });
    return sendJson(res,201,{ ok: true },origin);
  });

  router.post('/api/partners/invitations/:id/accept', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const o = new ObjectId(req.params.id);
    const r = await pi.findOne({ _id: o });
    if (!r || r.to !== u.email || r.type !== 'partner' || r.status !== 'pending') return sendJson(res,403,{error:'forbidden'},origin);
    await pi.updateOne({ _id: o }, { $set: { status: 'accepted' } });
    const exists = await ps.findOne({ $or: [{ a: r.from, b: r.to },{ a: r.to, b: r.from }] });
    if (!exists) await ps.insertOne({ a: r.from, b: r.to, createdAt: new Date().toISOString(), role: 'partner' });
    return sendJson(res,200,{ ok: true },origin);
  });

  router.post('/api/partners/invitations/:id/reject', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const o = new ObjectId(req.params.id);
    const r = await pi.findOne({ _id: o });
    if (!r || r.to !== u.email || r.type !== 'partner' || r.status !== 'pending') return sendJson(res,403,{error:'forbidden'},origin);
    await pi.updateOne({ _id: o }, { $set: { status: 'rejected' } });
    return sendJson(res,200,{ ok: true },origin);
  });
}

module.exports = { register };
