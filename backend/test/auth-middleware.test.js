const test = require('node:test');
const assert = require('node:assert/strict');
const { authenticate, requireAuth } = require('../src/middleware/auth');
const { signToken } = require('../src/services/auth');

function makeRes() {
  const res = { status: null, body: null, headers: {} };
  res.writeHead = (s, h) => { res.status = s; Object.assign(res.headers, h || {}); };
  res.end = (b) => { res.body = b; };
  return res;
}

test('deleted user cannot authenticate', async () => {
  const secret = 'secretsecretsecretsecretsecret';
  const token = signToken({ sub: '507f1f77bcf86cd799439011', email: 'a@b.com', role: 'site_admin' }, secret);
  const ctx = {
    config: { tokenSecret: secret },
    db: { get: () => ({ findOne: async () => null }) }
  };
  const req = { headers: { authorization: 'Bearer ' + token } };
  const u = await authenticate(req, ctx);
  assert.equal(u, null);
});

test('revoked admin role loses admin access', async () => {
  const secret = 'secretsecretsecretsecretsecret';
  const id = '507f1f77bcf86cd799439011';
  const token = signToken({ sub: id, email: 'a@b.com', role: 'site_admin' }, secret);
  const ctx = {
    config: { tokenSecret: secret },
    db: { get: () => ({ findOne: async () => ({ _id: { toString: () => id }, email: 'a@b.com', role: 'regular_user' }) }) }
  };
  const req = { headers: { authorization: 'Bearer ' + token } };
  const u = await authenticate(req, ctx);
  assert.equal(u.role, 'regular_user');
});

test('current database role determines permissions', async () => {
  const secret = 'secretsecretsecretsecretsecret';
  const id = '507f1f77bcf86cd799439011';
  const token = signToken({ sub: id, email: 'a@b.com', role: 'regular_user' }, secret);
  const ctx = {
    config: { tokenSecret: secret },
    db: { get: () => ({ findOne: async () => ({ _id: { toString: () => id }, email: 'a@b.com', role: 'site_admin' }) }) }
  };
  const req = { headers: { authorization: 'Bearer ' + token } };
  const u = await authenticate(req, ctx);
  assert.equal(u.role, 'site_admin');
});

test('requireAuth returns 401 for missing user', async () => {
  const secret = 'secretsecretsecretsecretsecret';
  const token = signToken({ sub: '507f1f77bcf86cd799439011', email: 'a@b.com' }, secret);
  const ctx = {
    config: { tokenSecret: secret },
    db: { get: () => ({ findOne: async () => null }) }
  };
  const req = { headers: { authorization: 'Bearer ' + token } };
  const res = makeRes();
  const u = await requireAuth(req, res, ctx, '*');
  assert.equal(u, null);
  assert.equal(res.status, 401);
});