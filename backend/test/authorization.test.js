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

test('password hashing roundtrip', () => {
  const h = hashPassword('secret123');
  assert.equal(verifyPassword('secret123', h), true);
  assert.equal(verifyPassword('wrong', h), false);
});

test('token roundtrip', () => {
  const t = signToken({ sub: '1', email: 'a@b.com', role: 'user' }, 'secretsecretsecretsecretsecret');
  const p = verifyToken(t, 'secretsecretsecretsecretsecret');
  assert.equal(p.email, 'a@b.com');
  assert.equal(verifyToken(t, 'other'), null);
});
