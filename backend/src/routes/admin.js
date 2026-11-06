const { sendJson, parseBody } = require('../middleware/http');
const { requireAdmin } = require('../middleware/auth');

function distribution(rows, allowedStages) {
  const counts = Object.fromEntries(allowedStages.map((stage) => [stage, 0]));
  for (const row of rows) {
    const key = Object.hasOwn(counts, row._id) ? row._id : 'unspecified';
    counts[key] += Number(row.count) || 0;
  }
  return counts;
}

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const users = ctx.db.get('users');
  const settings = ctx.db.get('app_settings');

  router.get('/api/admin/stats', async (req,res) => {
    const u = await requireAdmin(req,res,ctx,origin); if(!u) return;
    const userCount = await users.countDocuments({});
    const projects = ctx.db.get('projects');
    const projectCount = await projects.countDocuments({});
    const taskCount = await ctx.db.get('tasks').countDocuments({});
    const [stageRows, typeRows] = await Promise.all([
      projects.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]).toArray(),
      projects.aggregate([{ $group: { _id: '$projectType', count: { $sum: 1 } } }]).toArray()
    ]);
    return sendJson(res,200,{ stats: {
      users: userCount,
      projects: projectCount,
      tasks: taskCount,
      projectStages: distribution(stageRows, ['idea', 'validation', 'mvp', 'launched', 'growth', 'unspecified']),
      projectTypes: distribution(typeRows, ['saas', 'ecommerce', 'services', 'retail', 'marketplace', 'other', 'unspecified'])
    } },origin);
  });

  router.get('/api/admin/daily-report', async (req, res) => {
  const u = await requireAdmin(req, res, ctx, origin); if(!u) return;
  const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
  if (adminEmails.length === 0) {
    return sendJson(res, 400, { error: 'no_admin_emails_configured' }, origin);
  }
  const reportData = await ctx.db.get('orders').aggregate([...]).toArray();
  await sendDailyReport(reportData, adminEmails);
  sendJson(res, 200, { ok: true, message: 'Daily report scheduled' }, origin);
});

router.get('/api/admin/monthly-report', async (req, res) => {
  const u = await requireAdmin(req, res, ctx, origin); if(!u) return;
  const adminEmails = process.env.ADMIN_EMAILS ? process.env.ADMIN_EMAILS.split(',') : [];
  if (adminEmails.length === 0) {
    return sendJson(res, 400, { error: 'no_admin_emails_configured' }, origin);
  }
  const endDate = new Date();
  const startDate = new Date(endDate.getFullYear(), endDate.getMonth() - 1, 1);
  const period = { startDate: startDate.toISOString(), endDate: endDate.toISOString() };
  await sendMonthlyReport(reportData, adminEmails, period);
  sendJson(res, 200, { ok: true, message: 'Monthly report scheduled' }, origin);
});

router.get('/api/admin/inventory-alerts', async (req, res) => {
  const u = await requireAdmin(req, res, ctx, origin); if(!u) return;
  const products = await ctx.db.get('products').find().toArray();
  await checkInventoryAlerts(products, ctx.db.get);
  sendJson(res, 200, { ok: true, message: 'Inventory alerts checked' }, origin);
});

  router.post('/api/admin/storage-sync/retry', async (req,res) => {
    const u = await requireAdmin(req,res,ctx,origin); if(!u) return;
    if (typeof ctx.db.retrySync !== 'function') {
      return sendJson(res,503,{error:'storage_sync_unavailable'},origin);
    }
    return sendJson(res,200,{ status: await ctx.db.retrySync() },origin);
  });

  router.get('/api/admin/users', async (req,res) => {
    const u = await requireAdmin(req,res,ctx,origin); if(!u) return;
    const url = new URL('http://x'+req.url);
    const q = String(url.searchParams.get('q')||'').trim().toLowerCase();
    const requestedPage = Number(url.searchParams.get('page')||1);
    const page = Number.isInteger(requestedPage) ? Math.max(1, requestedPage) : 1;
    const limit = 20;
    const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter = q ? { $or: [
      { email: { $regex: escapedQuery, $options: 'i' } },
      { username: { $regex: escapedQuery, $options: 'i' } },
      { displayName: { $regex: escapedQuery, $options: 'i' } }
    ] } : {};
    const total = await users.countDocuments(filter);
    const pages = Math.ceil(total / limit);
    const items = await users.find(filter, { projection: { passwordHash: 0, profile: 0 } })
      .skip((page-1)*limit).limit(limit).toArray();
    return sendJson(res,200,{ users: items.map(x=>({
      id:String(x._id),
      email:x.email,
      username:x.username || '',
      displayName:x.displayName || '',
      role:x.role,
      createdAt:x.createdAt
    })), total, page, pages },origin);
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
