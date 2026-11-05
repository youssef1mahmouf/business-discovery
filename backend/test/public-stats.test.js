const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

test('public statistics return database counts without authentication', async (t) => {
  const filters = {};
  const counts = { users: 18, projects: 7, tasks: 42, partnerships: 3 };
  const db = {
    get(name) {
      return {
        countDocuments: async (filter) => {
          filters[name] = filter;
          return counts[name] || 0;
        },
        find: () => ({ toArray: async () => [] }),
        findOne: async () => null,
        insertOne: async () => ({ insertedId: 'test-id' }),
        updateOne: async () => ({ matchedCount: 0 }),
        deleteOne: async () => ({ deletedCount: 0 }),
        deleteMany: async () => ({ deletedCount: 0 }),
        updateMany: async () => ({ modifiedCount: 0 }),
      };
    },
  };
  const server = createApp({
    config: { frontendOrigin: '*', tokenSecret: 'test-secret-with-more-than-32-characters' },
    db,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/public/stats`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    stats: { users: 18, projects: 7, tasks: 42, partnerships: 3 },
  });
  assert.deepEqual(filters.users, { status: { $ne: 'disabled' } });
  assert.deepEqual(filters.projects, { archived: { $ne: true } });
});
