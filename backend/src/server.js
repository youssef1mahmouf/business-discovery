const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { pathToFileURL } = require('url');
const { MongoClient } = require('mongodb');

const BACKEND_ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(BACKEND_ROOT, '.env');

let config = null;
let mongoClient = null;
let usersCollection = null;
let statesCollection = null;
let friendRequestsCollection = null;
let friendshipsCollection = null;
let partnerInvitesCollection = null;
let partnershipsCollection = null;
let appSettingsCollection = null;
let httpServer = null;

function loadEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function validateConfig(env = process.env) {
  const errors = [];
  const mongoUri = String(env.MONGODB_URI || '').trim();
  if (!mongoUri) {
    errors.push('MONGODB_URI is required');
  } else if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
    errors.push('MONGODB_URI must be a valid MongoDB connection string');
  }

  const production = String(env.NODE_ENV || 'development') === 'production';
  let tokenSecret = env.TOKEN_SECRET;
  if (production) {
    if (!tokenSecret) errors.push('TOKEN_SECRET is required in production');
    else if (tokenSecret === 'dev-only-change-me') errors.push('TOKEN_SECRET must not use the insecure development default');
    else if (String(tokenSecret).length < 32) errors.push('TOKEN_SECRET must be at least 32 characters in production');
  } else if (!tokenSecret) {
    tokenSecret = 'dev-only-change-me';
  }

  let frontendOrigin = env.FRONTEND_ORIGIN;
  if (production) {
    if (!frontendOrigin || frontendOrigin === '*') {
      errors.push('FRONTEND_ORIGIN must be explicitly configured in production');
    } else {
      try {
        const parsed = new URL(frontendOrigin);
        if (parsed.origin !== frontendOrigin) throw new Error('origin mismatch');
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
        if (parsed.protocol !== 'https:') errors.push('FRONTEND_ORIGIN must use HTTPS in production');
      } catch (error) {
        if (!errors.includes('FRONTEND_ORIGIN must use HTTPS in production')) {
          errors.push('FRONTEND_ORIGIN must be a valid origin URL');
        }
      }
    }
  } else if (!frontendOrigin) {
    frontendOrigin = '*';
  }

  if (errors.length > 0) {
    const error = new Error(errors.join('; '));
    error.name = 'ConfigValidationError';
    throw error;
  }

  const dbName = String(env.MONGODB_DB_NAME || '').trim() || 'business_discovery';
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port <= 0) {
    const error = new Error('PORT must be a positive integer');
    error.name = 'ConfigValidationError';
    throw error;
  }

  return {
    port,
    mongoUri,
    tokenSecret: String(tokenSecret),
    frontendOrigin: String(frontendOrigin),
    dbName,
    production
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex');
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(hash, 'hex'));
  } catch (error) {
    return false;
  }
}

function signToken(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return data + '.' + crypto.createHmac('sha256', secret).update(data).digest('base64url');
}

function verifyToken(token, secret) {
  const [data, signature] = String(token || '').split('.');
  if (!data || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  } catch (error) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }
}

function normalizeRole(userOrRole) {
  const role = typeof userOrRole === 'string'
    ? userOrRole
    : (userOrRole && typeof userOrRole === 'object' ? userOrRole.role : null);
  return role === 'site_admin' ? 'site_admin' : 'user';
}

function isSiteAdminRole(roleOrUser) {
  return normalizeRole(roleOrUser) === 'site_admin';
}

function send(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Access-Control-Allow-Origin': config.frontendOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'
  });
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function getToken(req) {
  const authorization = req.headers.authorization || '';
  return authorization.startsWith('Bearer ') ? authorization.slice(7) : null;
}

async function handleRequest(req, res) {
  if (req.method === 'OPTIONS') {
    send(res, 204, {});
    return;
  }

  const url = req.url.split('?')[0];

  try {
    if (req.method === 'GET' && url === '/api/health') {
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'POST' && url === '/api/auth/register') {
      const { email, password } = await parseBody(req);
      if (!email || !password || String(password).length < 8) {
        send(res, 400, { error: 'invalid_input' });
        return;
      }

      const normalizedEmail = String(email).toLowerCase();
      const user = {
        _id: Date.now(),
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        role: (normalizedEmail === 'youssef1mahmouf24@gmail.com' ? 'site_admin' : 'user'),
        createdAt: new Date().toISOString()
      };

      try {
        await usersCollection.insertOne(user);
      } catch (error) {
        if (error && error.code === 11000) {
          send(res, 409, { error: 'email_in_use' });
          return;
        }
        throw error;
      }

      const token = signToken({ sub: user._id, email: user.email, role: normalizeRole(user) }, config.tokenSecret);
      send(res, 200, { token, user: { id: user._id, email: user.email, role: normalizeRole(user) } });
      return;
    }

    if (req.method === 'POST' && url === '/api/auth/login') {
      const { email, password } = await parseBody(req);
      const user = await usersCollection.findOne({ email: String(email || '').toLowerCase() });
      if (!user || !verifyPassword(password || '', user.passwordHash)) {
        send(res, 401, { error: 'invalid_credentials' });
        return;
      }
if (String(user.email || '').toLowerCase() === 'youssef1mahmouf24@gmail.com' && user.role !== 'site_admin') { await usersCollection.updateOne({ _id: user._id }, { $set: { role: 'site_admin', updatedAt: new Date().toISOString() } }); user.role = 'site_admin'; }
      const token = signToken({ sub: user._id, email: user.email, role: normalizeRole(user) }, config.tokenSecret);
      send(res, 200, { token, user: { id: user._id, email: user.email, role: normalizeRole(user) } });
      return;
    }

    if (req.method === 'GET' && url === '/api/auth/me') {
      const payload = verifyToken(getToken(req), config.tokenSecret);
      if (!payload) {
        send(res, 401, { error: 'unauthorized' });
        return;
      }
      const user = await usersCollection.findOne({ _id: payload.sub });
if (user && String(user.email || '').toLowerCase() === 'youssef1mahmouf24@gmail.com' && user.role !== 'site_admin') { await usersCollection.updateOne({ _id: user._id }, { $set: { role: 'site_admin', updatedAt: new Date().toISOString() } }); user.role = 'site_admin'; }
      send(res, 200, { user: { id: payload.sub, email: payload.email, role: user ? normalizeRole(user) : normalizeRole(payload.role) } });
      return;
    }

    if (req.method === 'POST' && url === '/api/auth/change-password') {
      const payload = verifyToken(getToken(req), config.tokenSecret);
      if (!payload) {
        send(res, 401, { error: 'unauthorized' });
        return;
      }
      const { currentPassword, newPassword } = await parseBody(req);
      if (!newPassword || String(newPassword).length < 8) {
        send(res, 400, { error: 'invalid_input' });
        return;
      }

      const user = await usersCollection.findOne({ _id: payload.sub });
      if (!user || !verifyPassword(currentPassword || '', user.passwordHash)) {
        send(res, 401, { error: 'invalid_credentials' });
        return;
      }

      const result = await usersCollection.updateOne(
        { _id: payload.sub },
        { $set: { passwordHash: hashPassword(newPassword) } }
      );
      if (result.matchedCount === 0) {
        send(res, 401, { error: 'unauthorized' });
        return;
      }
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && url === '/api/state') {
      const payload = verifyToken(getToken(req), config.tokenSecret);
      if (!payload) {
        send(res, 401, { error: 'unauthorized' });
        return;
      }
      const stateDocument = await statesCollection.findOne({ _id: payload.sub });
      send(res, 200, { state: stateDocument ? stateDocument.state : null });
      return;
    }

    if (req.method === 'PUT' && url === '/api/state') {
      const payload = verifyToken(getToken(req), config.tokenSecret);
      if (!payload) {
        send(res, 401, { error: 'unauthorized' });
        return;
      }
      const { state } = await parseBody(req);
      if (!state || typeof state !== 'object' || Array.isArray(state)) {
        send(res, 400, { error: 'invalid_state' });
        return;
      }

      await statesCollection.updateOne(
        { _id: payload.sub },
        { $set: { state, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
      send(res, 200, { ok: true, updatedAt: new Date().toISOString() });
      return;
    }

    if (req.method === 'GET' && url === '/api/admin/site') {
      const payload = verifyToken(getToken(req), config.tokenSecret);
      if (!payload) {
        send(res, 401, { error: 'unauthorized' });
        return;
      }
      const user = await usersCollection.findOne({ _id: payload.sub });
      if (!user || !isSiteAdminRole(user)) {
        send(res, 403, { error: 'forbidden' });
        return;
      }
async function authenticatedUser(req) {
  const payload = verifyToken(getToken(req), config.tokenSecret);
  if (!payload) return null;
  const user = await usersCollection.findOne({ _id: payload.sub });
const authUser = await authenticatedUser(req);
if (req.method === 'GET' && url === '/api/users/search') {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const q = String((req.url.split('?')[1] || '').match(/q=([^&]*)/)?.[1] || '').trim();
  const decoded = decodeURIComponent(q);
  let filter = {};
  if (decoded.includes('@')) {
    if (!validEmail(decoded)) { send(res, 400, { error: 'invalid_email' }); return; }
    filter = { email: new RegExp('^' + decoded.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&') + '$', 'i') };
  } else if (decoded) {
    filter = { email: new RegExp(decoded.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'), 'i') };
  }
  const users = await usersCollection.find(filter).limit(20).toArray();
  const results = users
    .filter(u => u.email !== authUser.email)
    .map(u => ({ email: u.email, name: u.name || u.email.split('@')[0] }));
  send(res, 200, { users: results });
  return;
}
if (req.method === 'POST' && url === '/api/friends/requests') {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const body = await parseBody(req);
  const to = normEmail(body.to || body.toEmail);
  if (!validEmail(to)) { send(res, 400, { error: 'invalid_email' }); return; }
  if (to === authUser.email) { send(res, 400, { error: 'self_request' }); return; }
  const target = await usersCollection.findOne({ email: to });
  if (!target) { send(res, 404, { error: 'user_not_found' }); return; }
  const existing = await friendRequestsCollection.findOne({ from: authUser.email, to, type: 'friend' });
  const reverse = await friendRequestsCollection.findOne({ from: to, to: authUser.email, type: 'friend' });
  if (existing || reverse) { send(res, 409, { error: 'duplicate_request' }); return; }
if (req.method === 'GET' && url === '/api/friends/requests') {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const dir = (req.url.split('?')[1] || '').match(/direction=([^&]*)/)?.[1] || 'incoming';
  const filter = dir === 'outgoing' ? { from: authUser.email, type: 'friend' } : { to: authUser.email, type: 'friend' };
  const items = await friendRequestsCollection.find(filter).toArray();
  send(res, 200, { requests: items.map(x => ({ id: x._id, from: x.from, to: x.to, status: x.status, createdAt: x.createdAt })) });
  return;
}
const acceptMatch = url.match(new RegExp('^/api/friends/requests/(.+)/accept$'));
if (req.method === 'POST' && acceptMatch) {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const id = acceptMatch[1];
  const { ObjectId } = require('mongodb');
  let oid; try { oid = new ObjectId(id); } catch { send(res, 400, { error: 'invalid_id' }); return; }
  const r = await friendRequestsCollection.findOne({ _id: oid });
  if (!r || r.to !== authUser.email || r.type !== 'friend' || r.status !== 'pending') { send(res, 403, { error: 'forbidden' }); return; }
  await friendRequestsCollection.updateOne({ _id: oid }, { $set: { status: 'accepted' } });
  const exists = await friendshipsCollection.findOne({ $or: [{ a: r.from, b: r.to }, { a: r.to, b: r.from }] });
  if (!exists) await friendshipsCollection.insertOne({ a: r.from, b: r.to, createdAt: new Date().toISOString() });
  send(res, 200, { ok: true });
  return;
}
const rejectMatch = url.match(new RegExp('^/api/friends/requests/(.+)/reject$'));
if (req.method === 'POST' && rejectMatch) {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const id = rejectMatch[1];
  const { ObjectId } = require('mongodb');
  let oid; try { oid = new ObjectId(id); } catch { send(res, 400, { error: 'invalid_id' }); return; }
  const r = await friendRequestsCollection.findOne({ _id: oid });
  if (!r || r.to !== authUser.email || r.type !== 'friend' || r.status !== 'pending') { send(res, 403, { error: 'forbidden' }); return; }
  await friendRequestsCollection.updateOne({ _id: oid }, { $set: { status: 'rejected' } });
  send(res, 200, { ok: true });
  return;
}
if (req.method === 'GET' && url === '/api/friends') {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const items = await friendshipsCollection.find({ $or: [{ a: authUser.email }, { b: authUser.email }] }).toArray();
  const friends = items.map(x => x.a === authUser.email ? x.b : x.a);
  send(res, 200, { friends });
  return;
if (req.method === 'POST' && url === '/api/partners/invitations') {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const body = await parseBody(req);
  const to = normEmail(body.to || body.toEmail);
  if (!validEmail(to)) { send(res, 400, { error: 'invalid_email' }); return; }
  if (to === authUser.email) { send(res, 400, { error: 'self_invite' }); return; }
  const target = await usersCollection.findOne({ email: to });
  if (!target) { send(res, 404, { error: 'user_not_found' }); return; }
  const existing = await partnerInvitesCollection.findOne({ from: authUser.email, to, type: 'partner' });
  const reverse = await partnerInvitesCollection.findOne({ from: to, to: authUser.email, type: 'partner' });
  if (existing || reverse) { send(res, 409, { error: 'duplicate_invite' }); return; }
  await partnerInvitesCollection.insertOne({ from: authUser.email, to, type: 'partner', status: 'pending', createdAt: new Date().toISOString() });
  send(res, 201, { ok: true });
  return;
}
if (req.method === 'GET' && url === '/api/partners/invitations') {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const dir = (req.url.split('?')[1] || '').match(/direction=([^&]*)/)?.[1] || 'incoming';
  const filter = dir === 'outgoing' ? { from: authUser.email, type: 'partner' } : { to: authUser.email, type: 'partner' };
  const items = await partnerInvitesCollection.find(filter).toArray();
  send(res, 200, { invitations: items.map(x => ({ id: x._id, from: x.from, to: x.to, status: x.status, createdAt: x.createdAt })) });
  return;
}
const pinvAccept = url.match(new RegExp('^/api/partners/invitations/(.+)/accept$'));
if (req.method === 'POST' && pinvAccept) {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const id = pinvAccept[1];
  const { ObjectId } = require('mongodb');
  let oid; try { oid = new ObjectId(id); } catch { send(res, 400, { error: 'invalid_id' }); return; }
  const r = await partnerInvitesCollection.findOne({ _id: oid });
  if (!r || r.to !== authUser.email || r.type !== 'partner' || r.status !== 'pending') { send(res, 403, { error: 'forbidden' }); return; }
  await partnerInvitesCollection.updateOne({ _id: oid }, { $set: { status: 'accepted' } });
  const exists = await partnershipsCollection.findOne({ $or: [{ a: r.from, b: r.to }, { a: r.to, b: r.from }] });
  if (!exists) await partnershipsCollection.insertOne({ a: r.from, b: r.to, createdAt: new Date().toISOString(), role: 'partner' });
  send(res, 200, { ok: true });
  return;
}
const pinvReject = url.match(new RegExp('^/api/partners/invitations/(.+)/reject$'));
if (req.method === 'POST' && pinvReject) {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const id = pinvReject[1];
  const { ObjectId } = require('mongodb');
  let oid; try { oid = new ObjectId(id); } catch { send(res, 400, { error: 'invalid_id' }); return; }
  const r = await partnerInvitesCollection.findOne({ _id: oid });
  if (!r || r.to !== authUser.email || r.type !== 'partner' || r.status !== 'pending') { send(res, 403, { error: 'forbidden' }); return; }
  await partnerInvitesCollection.updateOne({ _id: oid }, { $set: { status: 'rejected' } });
  send(res, 200, { ok: true });
  return;
}
if (req.method === 'GET' && url === '/api/partners') {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const items = await partnershipsCollection.find({ $or: [{ a: authUser.email }, { b: authUser.email }] }).toArray();
  const partners = items.map(x => x.a === authUser.email ? x.b : x.a);
  send(res, 200, { partners });
  return;
}
if (req.method === 'GET' && url === '/api/notifications') {
  if (!authUser) { send(res, 401, { error: 'unauthorized' }); return; }
  const fr = await friendRequestsCollection.find({ to: authUser.email, type: 'friend', status: 'pending' }).toArray();
  const pi = await partnerInvitesCollection.find({ to: authUser.email, type: 'partner', status: 'pending' }).toArray();
  send(res, 200, { notifications: [
    ...fr.map(x => ({ id: x._id, type: 'friend', from: x.from, createdAt: x.createdAt })),
    ...pi.map(x => ({ id: x._id, type: 'partner', from: x.from, createdAt: x.createdAt }))
  ] });
  return;
}
}
  const doc = { from: authUser.email, to, type: 'friend', status: 'pending', createdAt: new Date().toISOString() };
  await friendRequestsCollection.insertOne(doc);
  send(res, 201, { ok: true });
  return;
}
  return user ? { id: user._id, email: user.email } : null;
}
function normEmail(v) { return String(v || '').trim().toLowerCase(); }
function validEmail(v) { return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(v || '').trim()); }
      send(res, 200, { ok: true, role: 'site_admin' });
      return;
    }

    send(res, 404, { error: 'not_found' });
  } catch (error) {
    console.error('Request failed:', error && error.name ? error.name : 'Error');
    send(res, 500, { error: 'server_error' });
  }
}

async function connectDatabase(databaseConfig) {
  const client = new MongoClient(databaseConfig.mongoUri, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000
  });
  await client.connect();
  await client.db('admin').command({ ping: 1 });

  const db = client.db(databaseConfig.dbName);
  usersCollection = db.collection('users');
  statesCollection = db.collection('user_states');
  friendRequestsCollection = db.collection('friend_requests');
  friendshipsCollection = db.collection('friendships');
  partnerInvitesCollection = db.collection('partner_invites');
  partnershipsCollection = db.collection('partnerships');
  appSettingsCollection = db.collection('app_settings');
  await usersCollection.createIndex({ email: 1 }, { unique: true });
  await friendRequestsCollection.createIndex({ from: 1, to: 1, type: 1 }, { unique: true });

  mongoClient = client;
}

async function shutdown(signal) {
  console.log('Received ' + signal + '; shutting down.');
  if (httpServer) {
    httpServer.close();
  }
  if (mongoClient) {
    try {
      await mongoClient.close();
    } catch (error) {
      console.error('Error while closing MongoDB connection.');
    }
  }
  process.exit(0);
}

function resolveFrontendUrl(databaseConfig) {
  const origin = String(databaseConfig.frontendOrigin || '').trim();
  if (origin && origin !== '*' && /^https?:\/\//.test(origin)) {
    try {
      const parsed = new URL(origin);
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        return origin;
      }
    } catch (error) {
      // Fall through to the local frontend file.
    }
  }
  const frontendIndex = path.resolve(BACKEND_ROOT, '..', 'frontend', 'index.html');
  return pathToFileURL(frontendIndex).href;
}

function shouldOpenBrowser() {
  const lockPath = path.join(BACKEND_ROOT, '.browser-open.lock');
  try {
    const stat = fs.statSync(lockPath);
    if (Date.now() - stat.mtimeMs < 15000) return false;
  } catch (error) {
    // Lock does not exist yet.
  }
  try {
    fs.writeFileSync(lockPath, String(Date.now()));
  } catch (error) {
    // If the lock cannot be written, still allow opening.
  }
  return true;
}

function openBrowser(url) {
  console.log('Frontend URL: ' + url);
  if (!shouldOpenBrowser()) {
    console.log('Browser open skipped to avoid duplicate tabs.');
    return;
  }

  const command =
    process.platform === 'win32'
      ? 'start "" "' + url + '"'
      : process.platform === 'darwin'
        ? 'open "' + url + '"'
        : 'xdg-open "' + url + '"';

  exec(command, (error) => {
    if (error) {
      console.log('Could not open the browser automatically. Open this URL manually: ' + url);
    }
  });
}

async function start() {
  loadEnvFile();
  config = validateConfig();

  await connectDatabase(config);

  const server = http.createServer(handleRequest);
  await new Promise((resolve, reject) => {
    server.listen(config.port, () => {
      console.log('Backend listening on ' + config.port);
      resolve();
    });
    server.on('error', reject);
  });

  httpServer = server;
  const frontendUrl = resolveFrontendUrl(config);
  openBrowser(frontendUrl);
  process.on('SIGTERM', () => {
    shutdown('SIGTERM').catch(() => process.exit(1));
  });
  process.on('SIGINT', () => {
    shutdown('SIGINT').catch(() => process.exit(1));
  });
}

if (require.main === module) {
  start().catch((error) => {
    if (error && error.name === 'ConfigValidationError') {
      console.error('Configuration error: ' + error.message);
    } else {
      console.error('Failed to start backend.');
    }
    process.exit(1);
  });
}

module.exports = {
  loadEnvFile,
  validateConfig,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  normalizeRole,
  isSiteAdminRole
};