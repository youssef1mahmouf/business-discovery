const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRole, isSiteAdminRole } = require('../src/server');

test('site_admin role is recognized', () => {
  assert.equal(normalizeRole('site_admin'), 'site_admin');
  assert.equal(isSiteAdminRole('site_admin'), true);
  assert.equal(isSiteAdminRole({ role: 'site_admin' }), true);
});

test('ordinary users are not super admins', () => {
  assert.equal(normalizeRole('user'), 'user');
  assert.equal(normalizeRole({ role: 'user' }), 'user');
  assert.equal(isSiteAdminRole('user'), false);
  assert.equal(isSiteAdminRole({}), false);
  assert.equal(isSiteAdminRole(null), false);
  assert.equal(isSiteAdminRole(undefined), false);
});