const { sendJson } = require('../middleware/http');

function register(router, ctx) {
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const users = ctx.db.get('users');
  const projects = ctx.db.get('projects');
  const tasks = ctx.db.get('tasks');
  const partnerships = ctx.db.get('partnerships');

  router.get('/api/public/stats', async (req, res) => {
    const [userCount, projectCount, taskCount, partnershipCount] = await Promise.all([
      users.countDocuments({ status: { $ne: 'disabled' } }),
      projects.countDocuments({ archived: { $ne: true } }),
      tasks.countDocuments(),
      partnerships.countDocuments(),
    ]);
    return sendJson(res, 200, {
      stats: {
        users: userCount,
        projects: projectCount,
        tasks: taskCount,
        partnerships: partnershipCount,
      },
    }, origin);
  });
}

module.exports = { register };
