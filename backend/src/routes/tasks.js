const { sendJson, parseBody } = require('../middleware/http');
const { requireAuth } = require('../middleware/auth');
const { ObjectId } = require('mongodb');

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const tasks = ctx.db.get('tasks');
  const notifs = ctx.db.get('notifications');
  const projectMembers = ctx.db.get('project_members');
  const projects = ctx.db.get('projects');
  const managerRoles = new Set(['owner', 'project_manager', 'project_assistant']);

  router.get('/api/tasks', async (req,res) => {

    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    const url = new URL('http://x'+req.url);
    const page = Math.max(1, Number(url.searchParams.get('page')||1));
    const limit = Math.min(50, Number(url.searchParams.get('limit')||20));
    const managedProjects = await projectMembers.find({
      email: u.email,
      role: { $in: Array.from(managerRoles) }
    }).toArray();
    const clauses = [{ owner: u.email }, { assignee: u.email }];
    if (managedProjects.length) clauses.push({ projectId: { $in: managedProjects.map((item) => item.projectId) } });
    const q = { $or: clauses };
    const total = await tasks.countDocuments(q);
    const items = await tasks.find(q).skip((page-1)*limit).limit(limit).toArray();
    const managerProjectIds = new Set(managedProjects.map((item) => item.projectId));
    return sendJson(res,200,{
      tasks: items.map((task) => ({
        ...task,
        canApprove: !!task.projectId && managerProjectIds.has(task.projectId)
      })),
      total,
      page,
      pages: Math.ceil(total/limit)
    },origin);
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
    let projectId;
    if (body.projectId !== undefined) {
      projectId = String(body.projectId);
      let projectObjectId;
      try { projectObjectId = new ObjectId(projectId); } catch { return sendJson(res,400,{error:'invalid_id'},origin); }
      const project = await projects.findOne({ _id: projectObjectId, archived: { $ne: true } });
      const manager = await projectMembers.findOne({ projectId, email: u.email });
      const assigneeMember = await projectMembers.findOne({ projectId, email: assignee });
      if (!project || !manager || !managerRoles.has(manager.role)) return sendJson(res,403,{error:'forbidden'},origin);
      if (!assigneeMember) return sendJson(res,400,{error:'invalid_assignee'},origin);
    }
    const doc = {
      title,
      description: String(body.description||''),
      owner: u.email,
      assignee,
      status: 'open',
      ...(projectId ? { projectId } : {}),
      createdAt: new Date().toISOString()
    };
    const r = await tasks.insertOne(doc); doc._id = r.insertedId;
    return sendJson(res,201,{ task: doc },origin);
  });

  router.put('/api/tasks/:id', async (req,res) => {
    const u = await requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    let o; try { o = new ObjectId(req.params.id);} catch { return sendJson(res,400,{error:'invalid_id'},origin);}
    const t = await tasks.findOne({ _id: o });
    if (!t) return sendJson(res,404,{error:'not_found'},origin);
    const membership = t.projectId ? await projectMembers.findOne({ projectId: t.projectId, email: u.email }) : null;
    const isProjectManager = !!membership && managerRoles.has(membership.role);
    if (t.owner !== u.email && t.assignee !== u.email && !isProjectManager) return sendJson(res,403,{error:'forbidden'},origin);
    const updates = {};
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendJson(res,400,{error:'invalid_input'},origin);
    if (body.status !== undefined) {
      if (!['open', 'in_progress', 'done'].includes(body.status)) return sendJson(res,400,{error:'invalid_status'},origin);
      if (t.status === 'pending_approval' && !isProjectManager) return sendJson(res,403,{error:'forbidden'},origin);
      updates.status = body.status === 'done' && t.projectId && !isProjectManager
        ? 'pending_approval'
        : body.status;
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
    if (updates.status === 'pending_approval') {
      const projectManagers = await projectMembers.find({ projectId: t.projectId, role: { $in: Array.from(managerRoles) } }).toArray();
      const now = new Date().toISOString();
      await Promise.all(projectManagers.filter((manager) => manager.email !== u.email).map((manager) =>
        notifs.insertOne({
          userEmail: manager.email,
          type: 'task_approval',
          taskId: String(o),
          title: 'طلب اعتماد إكمال مهمة',
          message: t.title,
          read: false,
          createdAt: now
        })
      ));
    }
    return sendJson(res,200,{ ok: true, status: updates.status, approvalRequested: updates.status === 'pending_approval' },origin);
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
