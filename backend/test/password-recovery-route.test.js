const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { ObjectId } = require('mongodb');
const { createApp } = require('../src/app');
const { hashPassword, verifyPassword } = require('../src/services/auth');

test('password recovery code resets a password once and checks confirmation', async (t) => {
  const email = 'person@example.com';
  const code = '123456';
  const codeHash = crypto.createHash('sha256').update(code).digest('base64url');
  const user = { _id: new ObjectId(), email, passwordHash: hashPassword('old-password') };
  const state = {
    _id: new ObjectId(),
    email,
    code: codeHash,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    used: false,
    type: 'recovery',
  };
  const users = {
    async findOne(filter) { return filter.email === user.email ? user : null; },
    async updateOne(filter, update) {
      if (filter.email !== user.email) return { matchedCount: 0 };
      Object.assign(user, update.$set);
      return { matchedCount: 1 };
    },
  };
  const userStates = {
    async findOne(filter) {
      return Object.entries(filter).every(([key, value]) => state[key] === value) ? state : null;
    },
    async updateOne(filter, update) {
      if (!Object.entries(filter).every(([key, value]) => state[key] === value)) return { matchedCount: 0 };
      Object.assign(state, update.$set);
      return { matchedCount: 1 };
    },
    async updateMany(filter, update) {
      if (filter.email === state.email && !state.used) Object.assign(state, update.$set);
      return { modifiedCount: 1 };
    },
  };
  const emptyCollection = {
    countDocuments: async () => 0,
    find: () => ({ toArray: async () => [] }),
    findOne: async () => null,
    insertOne: async () => ({ insertedId: new ObjectId() }),
    updateOne: async () => ({ matchedCount: 0 }),
    deleteOne: async () => ({ deletedCount: 0 }),
    deleteMany: async () => ({ deletedCount: 0 }),
    updateMany: async () => ({ modifiedCount: 0 }),
  };
  const collections = { users, user_states: userStates };
  const server = createApp({
    config: {
      frontendOrigin: '*',
      tokenSecret: 'test-secret-with-more-than-32-characters',
      accessTokenTtlSeconds: 900,
      smtpConfig: {},
    },
    db: { get: (name) => collections[name] || emptyCollection },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const url = `http://127.0.0.1:${server.address().port}/api/auth/reset-password-with-code`;
  const send = (payload) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const mismatch = await send({ email, code, newPassword: 'new-password', confirmPassword: 'different' });
  assert.equal(mismatch.status, 400);
  assert.equal(state.used, false);

  const reset = await send({ email, code, newPassword: 'new-password', confirmPassword: 'new-password' });
  assert.equal(reset.status, 200);
  assert.equal(verifyPassword('new-password', user.passwordHash), true);
  assert.equal(verifyPassword('old-password', user.passwordHash), false);
  assert.equal(state.used, true);

  const replay = await send({ email, code, newPassword: 'another-password', confirmPassword: 'another-password' });
  assert.equal(replay.status, 400);
});
