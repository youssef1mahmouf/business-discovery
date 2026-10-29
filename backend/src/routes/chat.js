const { sendJson, parseBody } = require('../middleware/http');
const { requireAuth } = require('../middleware/auth');

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const convs = ctx.db.get('conversations');
  const msgs = ctx.db.get('messages');

  router.get('/api/conversations', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const items = await convs.find({ members: u.email }).toArray();
    return sendJson(res,200,{ conversations: items },origin);
  });

  router.post('/api/conversations', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    const type = ['general','group','direct'].includes(body.type) ? body.type : 'group';
    const members = Array.isArray(body.members) ? body.members.map(x=>String(x).trim().toLowerCase()) : [];
    if (!members.includes(u.email)) members.push(u.email);
    // direct: reuse existing
    if (type === 'direct' && members.length === 2) {
      const existing = await convs.findOne({ type:'direct', members: { $all: members, $size: 2 } });
      if (existing) return sendJson(res,200,{ conversation: existing },origin);
    }
    const doc = { type, title: String(body.title||''), members, owner: u.email, createdAt: new Date().toISOString() };
    const r = await convs.insertOne(doc); doc._id = r.insertedId;
    return sendJson(res,201,{ conversation: doc },origin);
  });

  router.get('/api/conversations/:id/messages', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const c = await convs.findOne({ _id: require('mongodb').ObjectId(req.params.id) });
    if (!c || !c.members.includes(u.email)) return sendJson(res,403,{error:'forbidden'},origin);
    const url = new URL('http://x'+req.url);
    const limit = Math.min(50, Number(url.searchParams.get('limit')||20));
    const items = await msgs.find({ conversationId: req.params.id }).sort({ createdAt: -1 }).limit(limit).toArray();
    return sendJson(res,200,{ messages: items.reverse() },origin);
  });

  router.post('/api/conversations/:id/messages', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const c = await convs.findOne({ _id: require('mongodb').ObjectId(req.params.id) });
    if (!c || !c.members.includes(u.email)) return sendJson(res,403,{error:'forbidden'},origin);
    let body; try { body=await parseBody(req);} catch { return sendJson(res,400,{error:'invalid_json'},origin);}
    const content = String(body.content||'').trim();
    if (!content || content.length > 2000) return sendJson(res,400,{error:'invalid_input'},origin);
    const doc = { conversationId: req.params.id, sender: u.email, content, createdAt: new Date().toISOString() };
    const r = await msgs.insertOne(doc); doc._id = r.insertedId;
    return sendJson(res,201,{ message: doc },origin);
  });
  router.post('/api/ai/chat', async (req,res) => {
    const u = requireAuth(req,res,ctx,origin); if(!u) return;
    const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
    if (!key) return sendJson(res,503,{ error:'ai_unavailable', message:'No AI provider configured' },origin);
    return sendJson(res,503,{ error:'ai_not_implemented' },origin);
  });
}

module.exports = { register };
