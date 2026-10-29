const { sendJson, parseBody } = require('../middleware/http');
const { requireAuth } = require('../middleware/auth');

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const tasks = ctx.db.get('tasks');
  const notifs = ctx.db.get('notifications');

  router.get('/api/tasks', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const items = await tasks.find({ $or: [{ owner: u.email }, { assignee: u.email }] }).toArray();
    return sendJson(res,200,{ tasks: items },origin);
  });

  router.post('/api/tasks', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    const title = String(body.title||'').trim();
    if (!title) return sendJson(res,400,{error:'invalid_input'},origin);
    const doc = { title, description: String(body.description||''), owner: u.email, assignee: String(body.assignee||u.email), status: 'open', createdAt: new Date().toISOString() };
    const r = await tasks.insertOne(doc); doc._id = r.insertedId;
    return sendJson(res,201,{ task: doc },origin);
  });

  router.put('/api/tasks/:id', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    const { ObjectId } = require('mongodb');
    let o; try { o = new ObjectId(req.params.id);} catch { return sendJson(res,400,{error:'invalid_id'},origin);}
    const t = await tasks.findOne({ _id: o });
    if (!t || (t.owner !== u.email && t.assignee !== u.email)) return sendJson(res,403,{error:'forbidden'},origin);
    const updates = {};
    if (body.status) updates.status = String(body.status);
    if (body.title) updates.title = String(body.title);
    await tasks.updateOne({ _id: o }, { $set: updates });
    return sendJson(res,200,{ ok: true },origin);
  });

  router.get('/api/notifications', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const items = await notifs.find({ userEmail: u.email }).sort({ createdAt: -1 }).toArray();
    return sendJson(res,200,{ notifications: items },origin);
  });

  router.post('/api/notifications/:id/read', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const { ObjectId } = require('mongodb');
    let o; try { o = new ObjectId(req.params.id);} catch { return sendJson(res,400,{error:'invalid_id'},origin);}
    await notifs.updateOne({ _id: o, userEmail: u.email }, { $set: { read: true } });
    return sendJson(res,200,{ ok: true },origin);
  });
}

module.exports = { register };
