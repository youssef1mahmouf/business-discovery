const test = require('node:test');
const assert = require('node:assert/strict');
const { ObjectId } = require('mongodb');
const { createApp } = require('../src/app');
const { signToken } = require('../src/services/auth');

function matches(document, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((condition) => matches(document, condition));
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return expected.$in.some((value) => String(document[key]) === String(value));
    }
    return String(document[key]) === String(expected);
  });
}

function makeCollection(documents = []) {
  return {
    documents,
    find(query = {}) {
      let offset = 0;
      let limit = Infinity;
      const cursor = {
        skip(value) { offset = value; return cursor; },
        limit(value) { limit = value; return cursor; },
        async toArray() { return documents.filter((item) => matches(item, query)).slice(offset, offset + limit); }
      };
      return cursor;
    },
    async findOne(query) { return documents.find((item) => matches(item, query)) || null; },
    async countDocuments(query) { return documents.filter((item) => matches(item, query)).length; },
    async insertOne(document) {
      document._id = new ObjectId();
      documents.push(document);
      return { insertedId: document._id };
    },
    async updateOne(query, update) {
      const document = documents.find((item) => matches(item, query));
      if (document) Object.assign(document, update.$set);
      return { matchedCount: document ? 1 : 0 };
    },
    async deleteOne(query) {
      const index = documents.findIndex((item) => matches(item, query));
      if (index >= 0) documents.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    }
  };
}

test('participant routes enforce project membership and management roles', async (t) => {
  const userId = new ObjectId();
  const projectId = new ObjectId();
  const otherProjectId = new ObjectId();
  const user = { _id: userId, email: 'member@example.com', role: 'regular_user' };
  const project = { _id: projectId, name: 'Member project' };
  const otherProject = { _id: otherProjectId, name: 'Private project' };
  const firstParticipant = { _id: new ObjectId(), name: 'Visible', projectId: String(projectId) };
  const privateParticipant = { _id: new ObjectId(), name: 'Private', projectId: String(otherProjectId) };
  const collections = {
    users: makeCollection([user]),
    projects: makeCollection([project, otherProject]),
    project_members: makeCollection([
      { projectId: String(projectId), email: user.email, role: 'owner' }
    ]),
    participants: makeCollection([firstParticipant, privateParticipant])
  };
  const config = { frontendOrigin: '*', tokenSecret: 'test-secret-with-more-than-32-characters' };
  const server = createApp({ config, db: { get: (name) => collections[name] } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const url = `http://127.0.0.1:${server.address().port}`;
  const token = signToken({ sub: String(userId), email: user.email }, config.tokenSecret);
  const request = (path, options = {}) => fetch(url + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  const ownParticipants = await request('/api/participants');
  assert.equal(ownParticipants.status, 200);
  assert.deepEqual((await ownParticipants.json()).participants.map((item) => item.name), ['Visible']);

  const privateList = await request(`/api/participants?projectId=${otherProjectId}`);
  assert.equal(privateList.status, 403);

  const privateUpdate = await request(`/api/participants/${privateParticipant._id}`, {
    method: 'PUT',
    body: JSON.stringify({ name: 'Changed' })
  });
  assert.equal(privateUpdate.status, 403);
  assert.equal(privateParticipant.name, 'Private');

  const privateDelete = await request(`/api/participants/${privateParticipant._id}`, { method: 'DELETE' });
  assert.equal(privateDelete.status, 403);
  assert.ok(collections.participants.documents.includes(privateParticipant));

  const unauthorizedCreate = await request('/api/participants', {
    method: 'POST',
    body: JSON.stringify({ name: 'Unauthorized', projectId: String(otherProjectId) })
  });
  assert.equal(unauthorizedCreate.status, 403);

  const created = await request('/api/participants', {
    method: 'POST',
    body: JSON.stringify({ name: 'Added', projectId: String(projectId) })
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).participant.projectId, String(projectId));
});
