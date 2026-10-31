const test = require('node:test');
const assert = require('node:assert/strict');
const { getProvisionEmail } = require('../scripts/promote-super-admin');

test('provisioning refuses missing configuration', () => {
  assert.throws(() => getProvisionEmail({}), /ADMIN_EMAIL is required/);
});

test('provisioning validates email format', () => {
  assert.throws(() => getProvisionEmail({ ADMIN_EMAIL: 'not-an-email' }), /valid email/);
  assert.equal(getProvisionEmail({ ADMIN_EMAIL: 'Admin@Example.com ' }), 'admin@example.com');
});

test('provisioning script does not run automatically on require', () => {
  // Requiring the module must not connect to any database or throw.
  const m = require('../scripts/promote-super-admin');
  assert.equal(typeof m.getProvisionEmail, 'function');
});