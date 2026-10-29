const { loadEnvFile, validateConfig } = require('./config');
const db = require('./db/mongo');
const fs = require('fs');
const path = require('path');
const { createApp } = require('./app');

let httpServer = null;

function shouldOpenBrowser() {
  const lockPath = path.join(__dirname, '..', '.browser-open.lock');
  try {
    const stat = fs.statSync(lockPath);
    if (Date.now() - stat.mtimeMs < 15000) return false;
  } catch {}
  try { fs.writeFileSync(lockPath, String(Date.now())); } catch {}
  return true;
}

async function start() {
  loadEnvFile();
  const config = validateConfig();
  const conn = await db.connect(config);
  const ctx = { config, db: { get: (name) => conn.collections[name] } };

  const server = createApp(ctx);
  await new Promise((resolve, reject) => {
    server.listen(config.port, () => { console.log('Backend listening on ' + config.port); resolve(); });
    server.on('error', reject);
  });
  httpServer = server;
  // open browser
  const frontendUrl = 'http://localhost:' + config.port + '/';
  console.log('Frontend URL: ' + frontendUrl);
  if (shouldOpenBrowser()) {
    const cmd = process.platform === 'win32' ? 'start "" "' + frontendUrl + '"' : process.platform === 'darwin' ? 'open "' + frontendUrl + '"' : 'xdg-open "' + frontendUrl + '"';
    require('child_process').exec(cmd, () => {});
  }
  const shutdown = async () => { server.close(); await db.close(); process.exit(0); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  return server;
}

if (require.main === module) {
  start().catch((err) => {
    if (err && err.name === 'ConfigValidationError') console.error('Configuration error: ' + err.message);
    else console.error('Failed to start backend.', err);
    process.exit(1);
  });
}

module.exports = { start, validateConfig: require('./config').validateConfig };
// re-export for tests
const cfg = require('./config');
module.exports.loadEnvFile = cfg.loadEnvFile;
const auth = require('./services/auth');
Object.assign(module.exports, auth);
