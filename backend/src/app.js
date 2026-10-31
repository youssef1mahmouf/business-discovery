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
  const url = req.url.split('?')[0];
  if (req.method !== 'GET') return false;
  let filePath = path.join(FRONTEND_DIR, url === '/' ? 'index.html' : url);
  // prevent path traversal
  if (!filePath.startsWith(FRONTEND_DIR)) return false;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(FRONTEND_DIR, 'index.html');
    if (!fs.existsSync(filePath)) return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

function createApp(ctx) {
  const router = createRouter();
  authRoutes.register(router, ctx);
  projectRoutes.register(router, ctx);
  friendRoutes.register(router, ctx);
  taskRoutes.register(router, ctx);
  adminRoutes.register(router, ctx);
  chatRoutes.register(router, ctx);

  const origin = ctx.config.frontendOrigin === '*' ? '*' : ctx.config.frontendOrigin;

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      });
      res.end();
      return;
    }
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && url === '/api/health') {
      return sendJson(res, 200, { ok: true, service: 'business-discovery' }, origin);
    }
    if (url.startsWith('/api/')) {
      try {
        const handled = await router.handle(req, res, ctx);
        if (!handled) sendJson(res, 404, { error: 'not_found' }, origin);
      } catch (err) {
        console.error('Request failed:', err && err.message ? err.message : err);
        sendJson(res, 500, { error: 'server_error' }, origin);
      }
      return;
    }
    // static frontend
    if (serveStatic(req, res)) return;
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });
  return server;
}

module.exports = { createApp };
