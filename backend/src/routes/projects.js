const { sendJson, parseBody } = require('../middleware/http');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { ObjectId } = require('mongodb');

function oid(v){ try { return new ObjectId(v); } catch { return null; } }

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const projects = ctx.db.get('projects');
  const members = ctx.db.get('project_members');
  const participants = ctx.db.get('participants');

  router.get('/api/projects', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const ms = await members.find({ email: u.email }).toArray();
    const ids = ms.map(m=>m.projectId);
    const items = await projects.find({ _id: { $in: ids.map(x=>oid(x)).filter(Boolean) } }).toArray();
    return sendJson(res,200,{ projects: items.map(p=>({id:String(p._id),name:p.name,description:p.description||''})) },origin);
  });

  router.post('/api/projects', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    const name = String(body.name||'').trim();
    if (!name) return sendJson(res,400,{error:'invalid_input'},origin);
    const r = await projects.insertOne({ name, description: String(body.description||''), owner: u.email, createdAt: new Date().toISOString() });
    await members.insertOne({ projectId: String(r.insertedId), email: u.email, role: 'owner', createdAt: new Date().toISOString() });
    return sendJson(res,201,{ project: { id: String(r.insertedId), name } },origin);
  });

  router.get('/api/projects/:id', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const id = req.params.id;
    const p = await projects.findOne({ _id: oid(id) });
    if (!p) return sendJson(res,404,{error:'not_found'},origin);
    const m = await members.findOne({ projectId: id, email: u.email });
    if (!m) return sendJson(res,403,{error:'forbidden'},origin);
    const mems = await members.find({ projectId: id }).toArray();
    const parts = await participants.find({ projectId: id }).toArray();
    return sendJson(res,200,{ project: { id: String(p._id), name: p.name, description: p.description||'' }, members: mems, participants: parts },origin);
  });

  router.post('/api/projects/:id/members', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const id = req.params.id;
    const m = await members.findOne({ projectId: id, email: u.email });
    if (!m || m.role !== 'owner') return sendJson(res,403,{error:'forbidden'},origin);
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    const email = String(body.email||'').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res,400,{error:'invalid_input'},origin);
    const exists = await members.findOne({ projectId: id, email });
    if (exists) return sendJson(res,409,{error:'already_member'},origin);
    await members.insertOne({ projectId: id, email, role: 'member', createdAt: new Date().toISOString() });
    return sendJson(res,201,{ ok: true },origin);
  });

  router.get('/api/participants', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const projectId = req.url.includes('?') ? new URL('http://x'+req.url).searchParams.get('projectId') : null;
    const q = projectId ? { projectId } : {};
    const items = await participants.find(q).toArray();
    return sendJson(res,200,{ participants: items },origin);
  });

  router.post('/api/participants', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    const name = String(body.name||'').trim();
    if (!name) return sendJson(res,400,{error:'invalid_input'},origin);
    const doc = { name, email: String(body.email||'').trim(), phone: String(body.phone||'').trim(), projectId: String(body.projectId||''), createdBy: u.email, createdAt: new Date().toISOString() };
    const r = await participants.insertOne(doc);
    doc._id = r.insertedId;
    return sendJson(res,201,{ participant: doc },origin);
  });
}

module.exports = { register };
