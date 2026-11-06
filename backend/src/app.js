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
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Invalid URL path');
    return true;
  }
  const relativePath = urlPath.replace(/^[/\\]+/, '') || 'index.html';
  const filePath = path.resolve(FRONTEND_DIR, relativePath);
  const resolvedRelativePath = path.relative(FRONTEND_DIR, filePath);
  if (path.isAbsolute(resolvedRelativePath) ||
      resolvedRelativePath === '..' ||
      resolvedRelativePath.startsWith('..' + path.sep)) {
    return sendStaticNotFound(res);
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (error) {
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
    let data = fs.readFileSync(filePath);
    
    // Inject Vercel Analytics for HTML files
    if (ext === '.html') {
      const analyticsScript = `<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>
</head>`;
      data = data.toString().replace('</head>', analyticsScript);
    }
    
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
    let data = fs.readFileSync(notFoundPath).toString();
    
    // Inject Vercel Analytics into 404 page
    const analyticsScript = `<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>
</head>`;
    data = data.replace('</head>', analyticsScript);
    
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(data);
  } catch (error) {
    console.error('Unable to load frontend 404 page:', error.code || error.name || 'Error');
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
  return true;
}

function createApp(ctx) {
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
