const { ObjectId } = require('mongodb');
const { sendJson, parseBody } = require('../middleware/http');
const { requireAuth } = require('../middleware/auth');
const { calculateAssessment } = require('../services/assessment');

const ASSESSMENT_MANAGERS = new Set(['owner', 'project_manager', 'project_assistant']);

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const assessments = ctx.db.get('project_assessments');
  const projects = ctx.db.get('projects');
  const members = ctx.db.get('project_members');

  async function getManager(req, res) {
    const user = await requireAuth(req, res, ctx, origin);
    if (!user) return null;
    let projectId;
    try { projectId = new ObjectId(req.params.id); } catch {
      sendJson(res, 400, { error: 'invalid_id' }, origin);
      return null;
    }
    const project = await projects.findOne({ _id: projectId, archived: { $ne: true } });
    if (!project) {
      sendJson(res, 404, { error: 'not_found' }, origin);
      return null;
    }
    const member = await members.findOne({ projectId: req.params.id, email: user.email });
    if (!member || !ASSESSMENT_MANAGERS.has(member.role)) {
      sendJson(res, 403, { error: 'forbidden' }, origin);
      return null;
    }
    return user;
  }

  router.get('/api/projects/:id/assessments', async (req, res) => {
    if (!await getManager(req, res)) return;
    const items = await assessments.find({ projectId: req.params.id })
      .sort({ createdAt: -1 }).limit(20).toArray();
    return sendJson(res, 200, { assessments: items }, origin);
  });

  router.post('/api/projects/:id/assessments', async (req, res) => {
    const user = await getManager(req, res);
    if (!user) return;
    let body;
    try { body = await parseBody(req); } catch { return sendJson(res, 400, { error: 'invalid_json' }, origin); }
    const result = calculateAssessment(body);
    if (!result) return sendJson(res, 400, { error: 'invalid_assessment' }, origin);
    const document = {
      ...result,
      projectId: req.params.id,
      createdBy: user.email
    };
    const inserted = await assessments.insertOne(document);
    document._id = inserted.insertedId;
    return sendJson(res, 201, { assessment: document }, origin);
  });
}

module.exports = { register };
