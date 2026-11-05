const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { ObjectId } = require('mongodb');
const { createApp } = require('../src/app');
const { signToken } = require('../src/services/auth');

function matches(document, query) {
  return Object.entries(query).every(([key, expected]) => {
    if (key === '$or') return expected.some((condition) => matches(document, condition));
    const value = document[key];
    if (expected && typeof expected === 'object' && '$in' in expected) {
      return expected.$in.some((item) => String(value) === String(item));
    }
    if (expected && typeof expected === 'object' && '$ne' in expected) return value !== expected.$ne;
    if (expected && typeof expected === 'object' && '$all' in expected) {
      return Array.isArray(value) && expected.$all.every((item) => value.includes(item)) &&
        ('$size' in expected ? value.length === expected.$size : true);
    }
    if (Array.isArray(value)) return value.includes(expected);
    return String(value) === String(expected);
  });
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let current = target;
  for (const key of keys.slice(0, -1)) current = current[key] || (current[key] = {});
  current[keys[keys.length - 1]] = value;
}

function makeCollection(documents = []) {
  function applyUpdate(document, update) {
    for (const [path, value] of Object.entries(update.$set || {})) setPath(document, path, value);
    for (const [path, value] of Object.entries(update.$inc || {})) {
      const keys = path.split('.');
      let current = document;
      for (const key of keys.slice(0, -1)) current = current[key] || (current[key] = {});
      const key = keys[keys.length - 1];
      current[key] = (current[key] || 0) + value;
    }
  }
  return {
    documents,
    find(query = {}) {
      let offset = 0;
      let limit = Infinity;
      let sort = null;
      const cursor = {
        skip(value) { offset = value; return cursor; },
        limit(value) { limit = value; return cursor; },
        sort(value) { sort = value; return cursor; },
        async toArray() {
          let items = documents.filter((item) => matches(item, query));
          if (sort) {
            const [key, direction] = Object.entries(sort)[0];
            items = items.slice().sort((a, b) => String(a[key]).localeCompare(String(b[key])) * direction);
          }
          return items.slice(offset, offset + limit);
        }
      };
      return cursor;
    },
    async findOne(query) { return documents.find((item) => matches(item, query)) || null; },
    async countDocuments(query) { return documents.filter((item) => matches(item, query)).length; },
    async insertOne(document) {
      document._id = document._id || new ObjectId();
      documents.push(document);
      return { insertedId: document._id };
    },
    async updateOne(query, update) {
      const document = documents.find((item) => matches(item, query));
      if (document) applyUpdate(document, update);
      return { matchedCount: document ? 1 : 0 };
    },
    async updateMany(query, update) {
      const items = documents.filter((item) => matches(item, query));
      items.forEach((item) => applyUpdate(item, update));
      return { modifiedCount: items.length };
    },
    async deleteOne(query) {
      const index = documents.findIndex((item) => matches(item, query));
      if (index >= 0) documents.splice(index, 1);
      return { deletedCount: index >= 0 ? 1 : 0 };
    },
    async deleteMany(query) {
      const remaining = documents.filter((item) => !matches(item, query));
      const deletedCount = documents.length - remaining.length;
      documents.splice(0, documents.length, ...remaining);
      return { deletedCount };
    }
  };
}

test('task, notification, and chat workflows enforce their API contracts', async (t) => {
  const secret = 'test-secret-with-more-than-32-characters';
  const ownerId = new ObjectId();
  const assigneeId = new ObjectId();
  const conversationId = new ObjectId();
  const otherEmail = 'assignee@example.com';
  const hashedOtherEmail = createHash('sha256').update(otherEmail).digest('hex');
  const task = {
    _id: new ObjectId(),
    title: 'Review proposal',
    owner: 'owner@example.com',
    assignee: otherEmail,
    status: 'open'
  };
  const ownNotification = { _id: new ObjectId(), userEmail: 'owner@example.com', read: false };
  const privateNotification = { _id: new ObjectId(), userEmail: otherEmail, read: false };
  const conversation = {
    _id: conversationId,
    type: 'direct',
    members: ['owner@example.com', otherEmail],
    unread: { [hashedOtherEmail]: 2 }
  };
  const collections = {
    users: makeCollection([
      { _id: ownerId, email: 'owner@example.com', role: 'regular_user' },
      { _id: assigneeId, email: otherEmail, role: 'regular_user' }
    ]),
    tasks: makeCollection([task]),
    notifications: makeCollection([ownNotification, privateNotification]),
    conversations: makeCollection([conversation]),
    messages: makeCollection()
  };
  const server = createApp({
    config: { frontendOrigin: '*', tokenSecret: secret },
    db: { get: (name) => collections[name] || makeCollection() }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const tokenFor = (id, email) => signToken({ sub: String(id), email }, secret);
  const request = (token, url, options = {}) => fetch(baseUrl + url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });
  const ownerToken = tokenFor(ownerId, 'owner@example.com');
  const assigneeToken = tokenFor(assigneeId, otherEmail);

  const notifications = await request(ownerToken, '/api/notifications');
  assert.deepEqual((await notifications.json()).notifications.map((item) => item._id), [ownNotification._id.toJSON()]);
  const markedRead = await request(ownerToken, `/api/notifications/${ownNotification._id}/read`, { method: 'POST' });
  assert.equal(markedRead.status, 200);
  assert.equal(ownNotification.read, true);
  assert.equal(privateNotification.read, false);

  const invalidStatus = await request(assigneeToken, `/api/tasks/${task._id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'invalid' })
  });
  assert.equal(invalidStatus.status, 400);
  assert.equal(task.status, 'open');
  const updatedTask = await request(assigneeToken, `/api/tasks/${task._id}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'done' })
  });
  assert.equal(updatedTask.status, 200);
  assert.equal(task.status, 'done');
  const deniedDelete = await request(assigneeToken, `/api/tasks/${task._id}`, { method: 'DELETE' });
  assert.equal(deniedDelete.status, 403);

  const unreadBefore = await request(assigneeToken, '/api/conversations');
  assert.equal((await unreadBefore.json()).conversations[0].unread, 2);
  const sentMessage = await request(ownerToken, `/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: 'Please review this.' })
  });
  assert.equal(sentMessage.status, 201);
  assert.equal(conversation.unread[hashedOtherEmail], 3);
  const messageList = await request(assigneeToken, `/api/conversations/${conversationId}/messages`);
  assert.equal(messageList.status, 200);
  assert.equal(conversation.unread[hashedOtherEmail], 0);
});
