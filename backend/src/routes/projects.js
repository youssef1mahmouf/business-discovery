const { sendJson, parseBody } = require('../middleware/http');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { ObjectId } = require('mongodb');

const PROJECT_TYPES = new Set(['saas', 'ecommerce', 'services', 'retail', 'marketplace', 'other']);
const PROJECT_STAGES = new Set(['idea', 'validation', 'mvp', 'launched', 'growth']);
const PROJECT_TEXT_LIMITS = {
  industry: 120,
  targetMarket: 500,
  problem: 2000
};

function oid(v){ try { return new ObjectId(v); } catch { return null; } }

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const projects = ctx.db.get('projects');
  const members = ctx.db.get('project_members');
  const participants = ctx.db.get('participants');
  const participantManagers = new Set(['owner', 'project_manager', 'project_assistant']);

  async function getParticipantProjectRole(projectId, email) {
    const projectObjectId = oid(projectId);
    if (!projectObjectId) return { error: 'invalid_id' };
    const project = await projects.findOne({ _id: projectObjectId });
    if (!project) return { error: 'not_found' };
    const membership = await members.findOne({ projectId, email });
    if (!membership) return { error: 'forbidden' };
    return { role: membership.role };
  }

  router.get('/api/projects', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const url = new URL('http://x'+req.url);
    const page = Math.max(1, Number(url.searchParams.get('page')||1));
    const limit = Math.min(50, Number(url.searchParams.get('limit')||20));
    const ms = await members.find({ email: u.email }).toArray();
    const ids = ms.map(m=>m.projectId);
    const oids = ids.map(x=>oid(x)).filter(Boolean);
    const projectQuery = { _id: { $in: oids }, archived: { $ne: true } };
    const total = await projects.countDocuments(projectQuery);
    const items = await projects.find(projectQuery).skip((page-1)*limit).limit(limit).toArray();
    const rolesByProject = new Map(ms.map((member) => [member.projectId, member.role]));
    return sendJson(res,200,{ projects: items.map(p=>({
      id:String(p._id),
      name:p.name,
      description:p.description||'',
      projectType:p.projectType||'',
      industry:p.industry||'',
      stage:p.stage||'',
      targetMarket:p.targetMarket||'',
      problem:p.problem||'',
      role:rolesByProject.get(String(p._id))||'member'
    })), total, page, pages: Math.ceil(total/limit) },origin);
  });

  router.post('/api/projects', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res,400,{error:'invalid_input'},origin);
    const name = String(body.name||'').trim();
    const description = String(body.description||'').trim();
    const projectType = String(body.projectType||'').trim();
    const stage = String(body.stage||'').trim();
    const details = Object.fromEntries(Object.entries(PROJECT_TEXT_LIMITS).map(([field, max]) => [field, String(body[field]||'').trim()]));
    if (!name || name.length > 160 || description.length > 4000 ||
        (projectType && !PROJECT_TYPES.has(projectType)) || (stage && !PROJECT_STAGES.has(stage)) ||
        Object.entries(details).some(([field, value]) => value.length > PROJECT_TEXT_LIMITS[field])) {
      return sendJson(res,400,{error:'invalid_input'},origin);
    }
    const r = await projects.insertOne({
      name, description, ...details,
      ...(projectType ? { projectType } : {}),
      ...(stage ? { stage } : {}),
      owner: u.email,
      createdAt: new Date().toISOString()
    });
    try {
      await members.insertOne({ projectId: String(r.insertedId), email: u.email, role: 'owner', createdAt: new Date().toISOString() });
    } catch (error) {
      try {
        await projects.deleteOne({ _id: r.insertedId });
      } catch (cleanupError) {
        console.error('Unable to remove incomplete project:', cleanupError && cleanupError.message || cleanupError);
      }
      throw error;
    }
    return sendJson(res,201,{ project: { id: String(r.insertedId), name, description, projectType, industry: details.industry, stage, targetMarket: details.targetMarket, problem: details.problem } },origin);
  });

  router.put('/api/projects/:id', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const id = req.params.id;
    const m = await members.findOne({ projectId: id, email: u.email });
    if (!m || m.role !== 'owner') return sendJson(res,403,{error:'forbidden'},origin);
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res,400,{error:'invalid_input'},origin);
    const updates = {};
    if (body.name !== undefined) {
      updates.name = String(body.name).trim();
      if (!updates.name || updates.name.length > 160) return sendJson(res,400,{error:'invalid_input'},origin);
    }
    if (body.description !== undefined) updates.description = String(body.description);
    if (body.projectType !== undefined) {
      updates.projectType = String(body.projectType).trim();
      if (updates.projectType && !PROJECT_TYPES.has(updates.projectType)) return sendJson(res,400,{error:'invalid_input'},origin);
    }
    if (body.stage !== undefined) {
      updates.stage = String(body.stage).trim();
      if (updates.stage && !PROJECT_STAGES.has(updates.stage)) return sendJson(res,400,{error:'invalid_input'},origin);
    }
    for (const [field, max] of Object.entries(PROJECT_TEXT_LIMITS)) {
      if (body[field] !== undefined) {
        updates[field] = String(body[field]).trim();
        if (updates[field].length > max) return sendJson(res,400,{error:'invalid_input'},origin);
      }
    }
    if (updates.description !== undefined && updates.description.length > 4000) return sendJson(res,400,{error:'invalid_input'},origin);
    if (body.archived !== undefined) updates.archived = !!body.archived;
    updates.updatedAt = new Date().toISOString();
    await projects.updateOne({ _id: oid(id) }, { $set: updates });
    return sendJson(res,200,{ ok:true },origin);
  });

  router.delete('/api/projects/:id', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const id = req.params.id;
    const m = await members.findOne({ projectId: id, email: u.email });
    if (!m || m.role !== 'owner') return sendJson(res,403,{error:'forbidden'},origin);
    await projects.updateOne({ _id: oid(id) }, { $set: { archived: true, deletedAt: new Date().toISOString() } });
    return sendJson(res,200,{ ok:true },origin);
  });

  router.delete('/api/projects/:id/members/:email', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const id = req.params.id;
    const m = await members.findOne({ projectId: id, email: u.email });
    if (!m || m.role !== 'owner') return sendJson(res,403,{error:'forbidden'},origin);
    const target = decodeURIComponent(req.params.email).toLowerCase();
    if (target === u.email) return sendJson(res,400,{error:'cannot_remove_owner'},origin);
    await members.deleteOne({ projectId: id, email: target });
    return sendJson(res,200,{ ok:true },origin);
  });
  router.get('/api/projects/:id', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const id = req.params.id;
    const p = await projects.findOne({ _id: oid(id) });
    if (!p) return sendJson(res,404,{error:'not_found'},origin);
    const m = await members.findOne({ projectId: id, email: u.email });
    if (!m) return sendJson(res,403,{error:'forbidden'},origin);
    const mems = await members.find({ projectId: id }).toArray();
    const parts = await participants.find({ projectId: id }).toArray();
    return sendJson(res,200,{ project: {
      id: String(p._id), name: p.name, description: p.description||'',
      projectType: p.projectType||'', industry: p.industry||'', stage: p.stage||'',
      targetMarket: p.targetMarket||'', problem: p.problem||''
    }, members: mems, participants: parts },origin);
  });

  router.put('/api/projects/:id/members/:email/role', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const id = req.params.id;
    const m = await members.findOne({ projectId: id, email: u.email });
    if (!m || m.role !== 'owner') return sendJson(res,403,{error:'forbidden'},origin);
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    const role = String(body.role||'').trim();
    if (!['project_manager','project_assistant','participant'].includes(role)) return sendJson(res,400,{error:'invalid_role'},origin);
    const target = decodeURIComponent(req.params.email).toLowerCase();
    if (target === u.email) return sendJson(res,400,{error:'cannot_change_owner'},origin);
    await members.updateOne({ projectId: id, email: target }, { $set: { role } });
    return sendJson(res,200,{ ok:true },origin);
  });
  router.post('/api/projects/:id/members', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
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
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const url = new URL('http://x'+req.url);
    const page = Math.max(1, Number(url.searchParams.get('page')||1));
    const limit = Math.min(50, Number(url.searchParams.get('limit')||20));
    const projectId = url.searchParams.get('projectId');
    let projectIds;
    if (projectId) {
      const access = await getParticipantProjectRole(projectId, u.email);
      if (access.error) {
        const status = access.error === 'invalid_id' ? 400 : access.error === 'not_found' ? 404 : 403;
        return sendJson(res,status,{error:access.error},origin);
      }
      projectIds = [projectId];
    } else {
      projectIds = (await members.find({ email: u.email }).toArray()).map(m => m.projectId);
    }
    const q = { projectId: { $in: projectIds } };
    const total = await participants.countDocuments(q);
    const items = await participants.find(q).skip((page-1)*limit).limit(limit).toArray();
    return sendJson(res,200,{ participants: items, total, page, pages: Math.ceil(total/limit) },origin);
  });

  router.put('/api/participants/:id', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const o = oid(req.params.id);
    if (!o) return sendJson(res,400,{error:'invalid_id'},origin);
    const participant = await participants.findOne({ _id: o });
    if (!participant) return sendJson(res,404,{error:'not_found'},origin);
    const access = await getParticipantProjectRole(participant.projectId, u.email);
    if (access.error) {
      const status = access.error === 'not_found' ? 404 : 403;
      return sendJson(res,status,{error:access.error},origin);
    }
    if (!participantManagers.has(access.role)) return sendJson(res,403,{error:'forbidden'},origin);
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res,400,{error:'invalid_input'},origin);
    const updates = {};
    if (body.name !== undefined) {
      updates.name = String(body.name).trim();
      if (!updates.name) return sendJson(res,400,{error:'invalid_input'},origin);
    }
    if (body.email !== undefined) {
      updates.email = String(body.email).trim().toLowerCase();
      if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) return sendJson(res,400,{error:'invalid_input'},origin);
    }
    if (body.phone !== undefined) updates.phone = String(body.phone).trim();
    if (!Object.keys(updates).length) return sendJson(res,400,{error:'invalid_input'},origin);
    updates.updatedAt = new Date().toISOString();
    await participants.updateOne({ _id: o, projectId: participant.projectId }, { $set: updates });
    return sendJson(res,200,{ ok:true },origin);
  });
  router.delete('/api/participants/:id', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const o = oid(req.params.id);
    if (!o) return sendJson(res,400,{error:'invalid_id'},origin);
    const participant = await participants.findOne({ _id: o });
    if (!participant) return sendJson(res,404,{error:'not_found'},origin);
    const access = await getParticipantProjectRole(participant.projectId, u.email);
    if (access.error) {
      const status = access.error === 'not_found' ? 404 : 403;
      return sendJson(res,status,{error:access.error},origin);
    }
    if (!participantManagers.has(access.role)) return sendJson(res,403,{error:'forbidden'},origin);
    await participants.deleteOne({ _id: o, projectId: participant.projectId });
    return sendJson(res,200,{ ok:true },origin);
  });
  router.post('/api/participants', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res,400,{error:'invalid_input'},origin);
    const name = String(body.name||'').trim();
    const projectId = String(body.projectId||'').trim();
    const email = String(body.email||'').trim().toLowerCase();
    if (!name || !oid(projectId) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return sendJson(res,400,{error:'invalid_input'},origin);
    const access = await getParticipantProjectRole(projectId, u.email);
    if (access.error) {
      const status = access.error === 'invalid_id' ? 400 : access.error === 'not_found' ? 404 : 403;
      return sendJson(res,status,{error:access.error},origin);
    }
    if (!participantManagers.has(access.role)) return sendJson(res,403,{error:'forbidden'},origin);
    const doc = { name, email, phone: String(body.phone||'').trim(), projectId, createdBy: u.email, createdAt: new Date().toISOString() };
    const r = await participants.insertOne(doc);
    doc._id = r.insertedId;
    return sendJson(res,201,{ participant: doc },origin);
  });
}

module.exports = { register };
