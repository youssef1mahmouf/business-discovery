const { sendJson, parseBody } = require('../middleware/http');
const { requireAuth } = require('../middleware/auth');

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const tasks = ctx.db.get('tasks');
  const notifs = ctx.db.get('notifications');

  router.get('/api/tasks', async (req,res) => {

    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const url = new URL('http://x'+req.url);
    const page = Math.max(1, Number(url.searchParams.get('page')||1));
    const limit = Math.min(50, Number(url.searchParams.get('limit')||20));
    const q = { $or: [{ owner: u.email }, { assignee: u.email }] };
    const total = await tasks.countDocuments(q);
    const items = await tasks.find(q).skip((page-1)*limit).limit(limit).toArray();
    return sendJson(res,200,{ tasks: items, total, page, pages: Math.ceil(total/limit) },origin);
  });

  router.post('/api/tasks', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res,400,{error:'invalid_input'},origin);
    const title = String(body.title||'').trim();
    const assignee = String(body.assignee||u.email).trim().toLowerCase();
    if (!title || title.length > 200 || (body.description && String(body.description).length > 4000) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assignee)) {
      return sendJson(res,400,{error:'invalid_input'},origin);
    }
    const doc = { title, description: String(body.description||''), owner: u.email, assignee, status: 'open', createdAt: new Date().toISOString() };
    const r = await tasks.insertOne(doc); doc._id = r.insertedId;
    return sendJson(res,201,{ task: doc },origin);
  });

  router.put('/api/tasks/:id', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    const { ObjectId } = require('mongodb');
    let o; try { o = new ObjectId(req.params.id);} catch { return sendJson(res,400,{error:'invalid_id'},origin);}
    const t = await tasks.findOne({ _id: o });
    if (!t || (t.owner !== u.email && t.assignee !== u.email)) return sendJson(res,403,{error:'forbidden'},origin);
    const updates = {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res,400,{error:'invalid_input'},origin);
    if (body.status !== undefined) {
      if (!['open', 'in_progress', 'done'].includes(body.status)) return sendJson(res,400,{error:'invalid_status'},origin);
      updates.status = body.status;
    }
    if (body.title !== undefined) {
      updates.title = String(body.title).trim();
      if (!updates.title || updates.title.length > 200) return sendJson(res,400,{error:'invalid_input'},origin);
    }
    if (body.description !== undefined) {
      updates.description = String(body.description);
      if (updates.description.length > 4000) return sendJson(res,400,{error:'invalid_input'},origin);
    }
    if (!Object.keys(updates).length) return sendJson(res,400,{error:'invalid_input'},origin);
    await tasks.updateOne({ _id: o }, { $set: updates });
    return sendJson(res,200,{ ok: true },origin);
  });

  router.get('/api/notifications', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const url = new URL('http://x'+req.url);
    const page = Math.max(1, Number(url.searchParams.get('page')||1));
    const limit = Math.min(50, Number(url.searchParams.get('limit')||20));
    const q = { userEmail: u.email };
    const total = await notifs.countDocuments(q);
    const items = await notifs.find(q).sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit).toArray();
    return sendJson(res,200,{ notifications: items, total, page, pages: Math.ceil(total/limit) },origin);
  });

  router.post('/api/notifications/:id/read', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const { ObjectId } = require('mongodb');
    let o; try { o = new ObjectId(req.params.id);} catch { return sendJson(res,400,{error:'invalid_id'},origin);}
    await notifs.updateOne({ _id: o, userEmail: u.email }, { $set: { read: true } });
    return sendJson(res,200,{ ok: true },origin);
  });
  router.delete('/api/tasks/:id', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const { ObjectId } = require('mongodb');
    let o; try { o=new ObjectId(req.params.id);} catch { return sendJson(res,400,{error:'invalid_id'},origin);}
    const t = await tasks.findOne({ _id: o });
    if (!t || t.owner !== u.email) return sendJson(res,403,{error:'forbidden'},origin);
    await tasks.deleteOne({ _id: o });
    return sendJson(res,200,{ ok:true },origin);
  });

  router.post('/api/notifications/read-all', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    await notifs.updateMany({ userEmail: u.email, read: false }, { $set: { read: true } });
    return sendJson(res,200,{ ok:true },origin);
  });

}
module.exports = { register };
