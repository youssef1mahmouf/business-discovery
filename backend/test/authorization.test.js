const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRole, isSiteAdminRole, hashPassword, verifyPassword, signToken, verifyToken } = require('../src/server');

test('site_admin role is recognized', () => {
  assert.equal(normalizeRole('site_admin'), 'site_admin');
  assert.equal(isSiteAdminRole('site_admin'), true);
  assert.equal(isSiteAdminRole({ role: 'site_admin' }), true);
});

test('ordinary users are not super admins', () => {
  assert.equal(normalizeRole('user'), 'regular_user');
  assert.equal(normalizeRole({ role: 'user' }), 'regular_user');
  assert.equal(isSiteAdminRole('user'), false);
  assert.equal(isSiteAdminRole({}), false);
  assert.equal(isSiteAdminRole(null), false);
  assert.equal(isSiteAdminRole(undefined), false);
});

test('email alone never grants admin role', () => {
  const u = { email: 'someone@example.com', role: 'regular_user' };
  assert.equal(normalizeRole(u), 'regular_user');
  assert.equal(isSiteAdminRole(u), false);
});

test('password hashing roundtrip', () => {
  const h = hashPassword('secret123');
  assert.equal(verifyPassword('secret123', h), true);
  assert.equal(verifyPassword('wrong', h), false);
});

test('token roundtrip', () => {
  const t = signToken({ sub: '1', email: 'a@b.com', role: 'user' }, 'secretsecretsecretsecretsecret');
  const p = verifyToken(t, 'secretsecretsecretsecretsecret');
  assert.equal(p.email, 'a@b.com');
  assert.ok(Number.isFinite(p.iat));
  assert.ok(Number.isFinite(p.exp));
  assert.equal(verifyToken(t, 'other'), null);
});

test('expired token is rejected', () => {
  const t = signToken({ sub: '1', email: 'a@b.com' }, 'secretsecretsecretsecretsecret', 60);
  const p = verifyToken(t, 'secretsecretsecretsecretsecret', Math.floor(Date.now()/1000) + 120);
  assert.equal(p, null);
});

test('invalid signature is rejected', () => {
  const t = signToken({ sub: '1', email: 'a@b.com' }, 'secretsecretsecretsecretsecret');
  const tampered = t.slice(0, -3) + 'abc';
  assert.equal(verifyToken(tampered, 'secretsecretsecretsecretsecret'), null);
});

test('missing expiration is rejected', () => {
  const crypto = require('crypto');
  const data = Buffer.from(JSON.stringify({ sub: '1', email: 'a@b.com' })).toString('base64url');
  const sig = crypto.createHmac('sha256', 'secretsecretsecretsecretsecret').update(data).digest('base64url');
  assert.equal(verifyToken(data + '.' + sig, 'secretsecretsecretsecretsecret'), null);
});

test('malformed token is rejected', () => {
  assert.equal(verifyToken('not-a-token', 'secretsecretsecretsecretsecret'), null);
  assert.equal(verifyToken('', 'secretsecretsecretsecretsecret'), null);
  assert.equal(verifyToken(null, 'secretsecretsecretsecretsecret'), null);
});

test('future iat is rejected', () => {
  const crypto = require('crypto');
  const now = Math.floor(Date.now()/1000);
  const data = Buffer.from(JSON.stringify({ sub:'1', email:'a@b.com', iat: now + 10000, exp: now + 10100 })).toString('base64url');
  const sig = crypto.createHmac('sha256','secretsecretsecretsecretsecret').update(data).digest('base64url');
  assert.equal(verifyToken(data+'.'+sig,'secretsecretsecretsecretsecret', now), null);
});
