const { sendJson, parseBody } = require('../middleware/http');
const { requireAdmin } = require('../middleware/auth');

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const users = ctx.db.get('users');
  const settings = ctx.db.get('app_settings');

  router.get('/api/admin/stats', async (req,res) => {
    const u = await requireAdmin(req,res,ctx,origin); if(!u) return;
    const userCount = await users.countDocuments();
    const projectCount = await ctx.db.get('projects').countDocuments();
    const taskCount = await ctx.db.get('tasks').countDocuments();
    return sendJson(res,200,{ stats: { users: userCount, projects: projectCount, tasks: taskCount } },origin);
  });

  router.get('/api/admin/users', async (req,res) => {
    const u = await requireAdmin(req,res,ctx,origin); if(!u) return;
    const url = new URL('http://x'+req.url);
    const q = String(url.searchParams.get('q')||'').trim().toLowerCase();
    const page = Math.max(1, Number(url.searchParams.get('page')||1));
    const limit = 20;
    const filter = q ? { email: { $regex: q, $options: 'i' } } : {};
    const total = await users.countDocuments(filter);
    const items = await users.find(filter, { projection: { passwordHash: 0 } }).skip((page-1)*limit).limit(limit).toArray();
    return sendJson(res,200,{ users: items.map(x=>({id:String(x._id),email:x.email,role:x.role,createdAt:x.createdAt})), total, page, pages: Math.ceil(total/limit) },origin);
  });

  router.get('/api/settings', async (req,res) => {
    const u = await requireAdmin(req,res,ctx,origin); if(!u) return;
    const doc = await settings.findOne({ key: 'app' });
    return sendJson(res,200,{ settings: doc ? doc.value : {} },origin);
  });

  router.put('/api/settings', async (req,res) => {
    const u = await requireAdmin(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return sendJson(res,400,{error:'invalid_input'},origin);
    await settings.updateOne({ key: 'app' }, { $set: { key: 'app', value: body, updatedAt: new Date().toISOString() } }, { upsert: true });
    return sendJson(res,200,{ ok: true },origin);
  });
}

module.exports = { register };
