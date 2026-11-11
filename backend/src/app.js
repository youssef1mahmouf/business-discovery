const http = require('http');
const fs = require('fs');
const path = require('path');
const { createRouter } = require('./middleware/router');
const { sendJson } = require('./middleware/http');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const friendRoutes = require('./routes/friends');
const taskRoutes = require('./routes/tasks');
const adminRoutes = require('./routes/admin');
const chatRoutes = require('./routes/chat');
const publicRoutes = require('./routes/public');
const profileRoutes = require('./routes/profile');
const assessmentRoutes = require('./routes/assessments');
const assistantRoutes = require('./routes/assistant');
const commerceRoutes = require('./routes/commerce');
const notification = require('./services/notification-schema');
const { scheduleDailyReport, scheduleMonthlyReport, checkInventoryAlerts } = require('./services/jobs');
const { securityHeaders, requireCSRF, generateCSRFToken, timingSafeEqual } = require('./middleware/security');
const { sanitizeQuery } = require('./middleware/sanitize');

const FRONTEND_DIR = path.resolve(__dirname, '..', '..', 'frontend');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res) {
  if (req.method !== 'GET') return false;
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); }
  catch { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Invalid URL path'); return true; }
  const relativePath = urlPath.replace(/^[/\\]+/, '') || 'index.html';
  const filePath = path.resolve(FRONTEND_DIR, relativePath);
  const resolvedRelativePath = path.relative(FRONTEND_DIR, filePath);
  if (path.isAbsolute(resolvedRelativePath) ||
      resolvedRelativePath === '..' ||
      resolvedRelativePath.startsWith('..' + path.sep)) {
    return sendStaticNotFound(res);
  }
  let stat;
  try { stat = fs.statSync(filePath); }
  catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return sendStaticNotFound(res);
    console.error('Unable to inspect frontend file:', error.code || error.name || 'Error');
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unable to read frontend file');
    return true;
  }
  if (!stat.isFile()) return sendStaticNotFound(res);
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
    return true;
  } catch (error) {
    console.error('Unable to read frontend file:', error.code || error.name || 'Error');
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Unable to read frontend file');
    return true;
  }
}

function sendStaticNotFound(res) {
  const notFoundPath = path.join(FRONTEND_DIR, '404.html');
  try {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(notFoundPath));
  } catch (error) {
    console.error('Unable to load frontend 404 page:', error.code || error.name || 'Error');
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
  return true;
}

function applySecurityHeaders(req, res, config) {
  if (req.method !== 'OPTIONS') {
    const headers = securityHeaders(config);
    for (const [key, value] of Object.entries(headers)) {
      res.setHeader(key, value);
    }
  }
}

function createApp(ctx) {
  ctx.csrfTokens = { tokens: new Map() };
  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;
  const router = createRouter();
  authRoutes.register(router, ctx);
  projectRoutes.register(router, ctx);
  friendRoutes.register(router, ctx);
  taskRoutes.register(router, ctx);
  adminRoutes.register(router, ctx);
  chatRoutes.register(router, ctx);
  publicRoutes.register(router, ctx);
  profileRoutes.register(router, ctx);
  assessmentRoutes.register(router, ctx);
  assistantRoutes.register(router, ctx);
  commerceRoutes.register(router, ctx);

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      });
      res.end();
      return;
    }
    applySecurityHeaders(req, res, config);
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && url === '/api/health') {
      return sendJson(res, 200, { ok: true, service: 'business-discovery' }, origin);
    }
    if (url.startsWith('/api/')) {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', async () => {
          try {
            let parsed = {};
            if (body) parsed = JSON.parse(body);
            parsed = sanitizeQuery(parsed);
            req.body = parsed;
            if (!requireCSRF(req, res, origin)) return;
            const handled = await router.handle(req, res, ctx);
            if (!handled) sendJson(res, 404, { error: 'not_found' }, origin);
          } catch (err) {
            console.error('Request failed:', err && err.message ? err.message : err);
            sendJson(res, 500, { error: 'server_error' }, origin);
          }
        });
        return;
      } else if (req.method === 'GET' || req.method === 'DELETE') {
        const token = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
        if (token && ctx.csrfTokens && typeof ctx.csrfTokens.validate === 'function') {
          if (!ctx.csrfTokens.validate(token)) {
            res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: 'csrf_token_invalid' }));
            return;
          }
        }
      }
      try {
        const handled = await router.handle(req, res, ctx);
        if (!handled) sendJson(res, 404, { error: 'not_found' }, origin);
      } catch (err) {
        console.error('Request failed:', err && err.message ? err.message : err);
        sendJson(res, 500, { error: 'server_error' }, origin);
      }
      return;
    }
    if (serveStatic(req, res)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });
  return server;
}

module.exports = { createApp };
