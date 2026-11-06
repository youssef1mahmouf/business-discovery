const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ObjectId } = require('mongodb');
const { HybridMongoDatabase } = require('../src/db/mongo');
const { clone, deepEqual, matches } = require('../src/db/hybrid-collection');
const { createApp } = require('../src/app');
const { hashPassword, signToken } = require('../src/services/auth');

function networkError() {
  const error = new Error('test database is unavailable');
  error.name = 'MongoNetworkError';
  error.code = 'ECONNRESET';
  return error;
}

function createBackend() {
  return { available: false, collections: new Map(), loseNextInsertReply: false };
}

function getDocuments(backend, name) {
  if (!backend.collections.has(name)) backend.collections.set(name, []);
  return backend.collections.get(name);
}

function ensureAvailable(backend) {
  if (!backend.available) throw networkError();
}

function fakeCollection(backend, name) {
  return {
    async createIndex() { ensureAvailable(backend); return 'test_index'; },
    find(query = {}) {
      return {
        async toArray() {
          ensureAvailable(backend);
          return getDocuments(backend, name).filter((document) => matches(document, query)).map(clone);
        }
      };
    },
    async findOne(query = {}) {
      ensureAvailable(backend);
      const document = getDocuments(backend, name).find((item) => matches(item, query));
      return document ? clone(document) : null;
    },
    async insertOne(document) {
      ensureAvailable(backend);
      const documents = getDocuments(backend, name);
      const duplicate = documents.some((item) =>
        deepEqual(item._id, document._id) ||
        (name === 'users' && item.email === document.email) ||
        (name === 'users' && document.username && item.username === document.username));
      if (duplicate) {
        const error = new Error('duplicate key');
        error.code = 11000;
        error.keyPattern = { email: 1 };
        throw error;
      }
      documents.push(clone(document));
      if (backend.loseNextInsertReply) {
        backend.loseNextInsertReply = false;
        throw networkError();
      }
      return { acknowledged: true, insertedId: clone(document._id) };
    },
    async replaceOne(filter, replacement) {
      ensureAvailable(backend);
      const documents = getDocuments(backend, name);
      const index = documents.findIndex((document) => matches(document, filter));
      if (index < 0) return { matchedCount: 0, modifiedCount: 0 };
      documents[index] = clone(replacement);
      return { matchedCount: 1, modifiedCount: 1 };
    },
    async deleteOne(filter) {
      ensureAvailable(backend);
      const documents = getDocuments(backend, name);
      const index = documents.findIndex((document) => matches(document, filter));
      if (index < 0) return { deletedCount: 0 };
      documents.splice(index, 1);
      return { deletedCount: 1 };
    }
  };
}

function createClientFactory(backend) {
  return () => ({
    async connect() { ensureAvailable(backend); },
    db(name) {
      if (name === 'admin') return { command: async () => { ensureAvailable(backend); return { ok: 1 }; } };
      return { collection: (collectionName) => fakeCollection(backend, collectionName) };
    },
    async close() {}
  });
}

const quietLogger = { info() {}, warn() {}, error() {} };

async function createManager(t, backend, directory, options = {}) {
  const manager = new HybridMongoDatabase({
    mongoUri: 'mongodb://test.invalid:27017',
    dbName: 'business_discovery',
    jsonFallbackDir: directory
  }, {
    clientFactory: createClientFactory(backend),
    logger: quietLogger,
    autoReconnect: false,
    ...options
  });
  await manager.start();
  t.after(() => manager.close());
  return manager;
}

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'business-discovery-fallback-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('MongoDB outage uses persistent JSON records and resumes after restart', async (t) => {
  const backend = createBackend();
  const directory = temporaryDirectory(t);
  const manager = await createManager(t, backend, directory);
  const inserted = await manager.collections.users.insertOne({
    email: 'offline@example.com',
    role: 'regular_user'
  });

  assert.equal((await manager.status()).storage, 'json_fallback');
  assert.equal(fs.existsSync(path.join(directory, 'fallback.json')), true);
  assert.equal(fs.existsSync(path.join(directory, 'fallback.json.bak')), true);

  const restarted = await createManager(t, backend, directory);
  const user = await restarted.collections.users.findOne({ _id: inserted.insertedId });
  assert.equal(user.email, 'offline@example.com');
  assert.equal(user.role, 'regular_user');
});

test('existing account routes continue to register and authenticate during an outage', async (t) => {
  const backend = createBackend();
  const directory = temporaryDirectory(t);
  const manager = await createManager(t, backend, directory);
  const secret = 'fallback-test-secret-with-at-least-32-characters';
  const server = createApp({
    config: { frontendOrigin: '*', tokenSecret: secret, accessTokenTtlSeconds: 900 },
    db: {
      get: (name) => manager.collections[name],
      getStatus: () => manager.status(),
      retrySync: () => manager.retrySync()
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const registration = await fetch(baseUrl + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'api-offline@example.com', password: 'secure-password' })
  });
  assert.equal(registration.status, 200);
  const account = await registration.json();
  assert.ok(account.token);

  const login = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'api-offline@example.com', password: 'secure-password' })
  });
  assert.equal(login.status, 200);
  assert.equal((await login.json()).user.email, 'api-offline@example.com');
});

test('persisted JSON users can sign in by email or username while MongoDB is unavailable', async (t) => {
  const backend = createBackend();
  const directory = temporaryDirectory(t);
  const manager = await createManager(t, backend, directory);
  await manager.collections.users.insertOne({
    email: 'json-user@example.com',
    username: 'json_user',
    passwordHash: hashPassword('correct-password'),
    role: 'regular_user'
  });
  await manager.close();

  const restarted = await createManager(t, backend, directory);
  const secret = 'fallback-login-test-secret-with-at-least-32-characters';
  const server = createApp({
    config: { frontendOrigin: '*', tokenSecret: secret, accessTokenTtlSeconds: 900 },
    db: {
      get: (name) => restarted.collections[name],
      getStatus: () => restarted.status(),
      retrySync: () => restarted.retrySync()
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/auth/login`;

  for (const identifier of ['json-user@example.com', 'JSON_USER']) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password: 'correct-password' })
    });
    assert.equal(response.status, 200);
    const account = await response.json();
    assert.equal(account.user.email, 'json-user@example.com');
    assert.ok(account.token);
  }

  const rejected = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'json_user', password: 'incorrect-password' })
  });
  assert.equal(rejected.status, 401);
  assert.deepEqual(await rejected.json(), { error: 'invalid_credentials' });
});

test('administrator storage status and retry endpoints expose pending sync safely', async (t) => {
  const backend = createBackend();
  const directory = temporaryDirectory(t);
  const manager = await createManager(t, backend, directory);
  const admin = { _id: new ObjectId(), email: 'storage-admin@example.com', role: 'main_super_admin' };
  await manager.collections.users.insertOne(admin);
  const secret = 'fallback-admin-test-secret-with-at-least-32-characters';
  const token = signToken({ sub: String(admin._id), email: admin.email }, secret);
  const server = createApp({
    config: { frontendOrigin: '*', tokenSecret: secret },
    db: {
      get: (name) => manager.collections[name],
      getStatus: () => manager.status(),
      retrySync: () => manager.retrySync()
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const statusResponse = await fetch(baseUrl + '/api/admin/storage-status', {
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(statusResponse.status, 200);
  assert.equal((await statusResponse.json()).status.pendingRecords, 1);

  backend.available = true;
  const retryResponse = await fetch(baseUrl + '/api/admin/storage-sync/retry', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  assert.equal(retryResponse.status, 200);
  assert.equal((await retryResponse.json()).status.pendingRecords, 0);
});

test('writes survive a disconnection and synchronize after MongoDB reconnects', async (t) => {
  const backend = createBackend();
  backend.available = true;
  const directory = temporaryDirectory(t);
  const manager = await createManager(t, backend, directory);
  backend.available = false;

  const inserted = await manager.collections.products.insertOne({ name: 'Offline item', price: 25 });
  assert.equal((await manager.status()).storage, 'json_fallback');
  assert.equal(getDocuments(backend, 'products').length, 0);

  backend.available = true;
  const status = await manager.retrySync();
  assert.equal(status.storage, 'mongodb');
  assert.equal(status.pendingRecords, 0);
  assert.equal(getDocuments(backend, 'products').length, 1);
  assert.equal(String(getDocuments(backend, 'products')[0]._id), String(inserted.insertedId));
});

test('MongoDB reconnect is detected automatically and pending writes are drained', async (t) => {
  const backend = createBackend();
  const directory = temporaryDirectory(t);
  const manager = await createManager(t, backend, directory, {
    autoReconnect: true,
    reconnectDelayMs: 20,
    maxReconnectDelayMs: 40
  });
  await manager.collections.products.insertOne({ name: 'Auto recovery' });
  backend.available = true;

  const deadline = Date.now() + 2000;
  let status;
  while (Date.now() < deadline) {
    status = await manager.status();
    if (status.mongoUsable) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(status.mongoUsable, true);
  assert.equal(status.pendingRecords, 0);
  assert.equal(getDocuments(backend, 'products').length, 1);
});

test('JSON unique constraints prevent duplicate records while disconnected', async (t) => {
  const backend = createBackend();
  const directory = temporaryDirectory(t);
  const manager = await createManager(t, backend, directory);
  await manager.collections.users.insertOne({ email: 'unique@example.com' });

  await assert.rejects(
    manager.collections.users.insertOne({ email: 'unique@example.com' }),
    (error) => error.code === 11000
  );
  assert.equal(await manager.collections.users.countDocuments({ email: 'unique@example.com' }), 1);
});

test('offline updateMany, deleteMany, and aggregate retain Mongo-compatible results', async (t) => {
  const manager = await createManager(t, createBackend(), temporaryDirectory(t));
  await manager.collections.products.insertMany([
    { name: 'A', active: true, price: 2 },
    { name: 'B', active: true, price: 4 },
    { name: 'C', active: false, price: 8 }
  ]);
  const updated = await manager.collections.products.updateMany(
    { active: true },
    { $inc: { price: 1 }, $set: { reviewed: true } }
  );
  assert.equal(updated.matchedCount, 2);
  assert.equal(updated.modifiedCount, 2);
  assert.equal(await manager.collections.products.countDocuments({ active: true, reviewed: true }), 2);

  const deleted = await manager.collections.products.deleteMany({ active: false });
  assert.equal(deleted.deletedCount, 1);
  await manager.collections.orders.insertMany([
    { status: 'paid', totalMinor: 1200, estimatedFeeMinor: 60 },
    { status: 'paid', totalMinor: 800, estimatedFeeMinor: 40 },
    { status: 'pending', totalMinor: 900, estimatedFeeMinor: 0 }
  ]);
  const [summary] = await manager.collections.orders.aggregate([
    { $match: { status: 'paid' } },
    { $group: {
      _id: null,
      count: { $sum: 1 },
      grossMinor: { $sum: '$totalMinor' },
      estimatedFeeMinor: { $sum: '$estimatedFeeMinor' }
    } }
  ]).toArray();
  assert.deepEqual(
    { count: summary.count, grossMinor: summary.grossMinor, estimatedFeeMinor: summary.estimatedFeeMinor },
    { count: 2, grossMinor: 2000, estimatedFeeMinor: 100 }
  );
});

test('an interrupted insert is verified on retry without creating a duplicate', async (t) => {
  const backend = createBackend();
  backend.available = true;
  const directory = temporaryDirectory(t);
  const first = await createManager(t, backend, directory);
  backend.loseNextInsertReply = true;

  const result = await first.collections.products.insertOne({ name: 'Single copy' });
  assert.equal(getDocuments(backend, 'products').length, 1);
  assert.equal((await first.status()).pendingRecords, 1);
  await first.close();

  const recovered = await createManager(t, backend, directory);
  const status = await recovered.status();
  assert.equal(status.pendingRecords, 0);
  assert.equal(status.storage, 'mongodb');
  assert.equal(getDocuments(backend, 'products').length, 1);
  assert.equal(String(getDocuments(backend, 'products')[0]._id), String(result.insertedId));
});

test('synchronization preserves remote changes and retains conflicts for review', async (t) => {
  const backend = createBackend();
  const user = { _id: new ObjectId(), email: 'conflict@example.com', displayName: 'Original' };
  backend.collections.set('users', [clone(user)]);
  backend.available = true;
  const manager = await createManager(t, backend, temporaryDirectory(t));
  backend.available = false;

  await manager.collections.users.updateOne(
    { _id: user._id },
    { $set: { displayName: 'Offline edit' } }
  );
  backend.collections.get('users')[0].remoteNote = 'Concurrent MongoDB edit';
  backend.available = true;

  const status = await manager.retrySync();
  assert.equal(status.conflictedRecords, 1);
  assert.equal(status.pendingRecords, 1);
  assert.equal(getDocuments(backend, 'users')[0].displayName, 'Original');
  assert.equal(getDocuments(backend, 'users')[0].remoteNote, 'Concurrent MongoDB edit');
  assert.equal((await manager.collections.users.findOne({ _id: user._id })).displayName, 'Offline edit');
});

test('synchronization drains journal entries appended by another process mid-replay', async (t) => {
  const backend = createBackend();
  const directory = temporaryDirectory(t);
  const first = await createManager(t, backend, directory);
  const second = await createManager(t, backend, directory);

  await first.collections.users.insertOne({ email: 'first@example.com' });
  backend.available = true;

  const syncEvent = first.syncEvent.bind(first);
  let injected = false;
  first.syncEvent = async (...args) => {
    if (!injected) {
      injected = true;
      await second.collections.products.insertOne({ name: 'Concurrent fallback write' });
    }
    return syncEvent(...args);
  };

  const status = await first.retrySync();
  assert.equal(injected, true);
  assert.equal(status.pendingRecords, 0);
  assert.equal(status.storage, 'mongodb');
  assert.equal(getDocuments(backend, 'products').length, 1);
  assert.equal(getDocuments(backend, 'products')[0].name, 'Concurrent fallback write');
});

test('a connected process synchronizes journal entries written by an offline peer', async (t) => {
  const backend = createBackend();
  const directory = temporaryDirectory(t);
  const first = await createManager(t, backend, directory);
  const second = await createManager(t, backend, directory);
  backend.available = true;
  assert.equal((await first.retrySync()).storage, 'mongodb');

  await second.collections.products.insertOne({ name: 'Peer offline write' });
  await first.collections.products.insertOne({ name: 'Connected process write' });

  assert.equal((await first.status()).pendingRecords, 0);
  assert.equal(getDocuments(backend, 'products').length, 2);
});

test('corrupt primary JSON is recovered from the current checksummed backup', async (t) => {
  const backend = createBackend();
  const directory = temporaryDirectory(t);
  const manager = await createManager(t, backend, directory);
  await manager.collections.users.insertOne({ email: 'recover@example.com' });
  await manager.close();

  fs.writeFileSync(path.join(directory, 'fallback.json'), '{corrupt');
  const recovered = await createManager(t, backend, directory);
  assert.equal(await recovered.collections.users.countDocuments({ email: 'recover@example.com' }), 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(directory, 'fallback.json'), 'utf8')).format, 1);
});

test('concurrent JSON writers serialize updates instead of losing records', async (t) => {
  const backend = createBackend();
  const directory = temporaryDirectory(t);
  const first = await createManager(t, backend, directory);
  const second = await createManager(t, backend, directory);

  await Promise.all([
    first.collections.products.insertOne({ name: 'First writer' }),
    second.collections.products.insertOne({ name: 'Second writer' })
  ]);
  assert.equal(await first.collections.products.countDocuments(), 2);
  assert.equal((await second.collections.products.find({}).toArray()).length, 2);
});

test('two corrupt fallback copies fail closed rather than replacing records with an empty store', async (t) => {
  const backend = createBackend();
  const directory = temporaryDirectory(t);
  const manager = await createManager(t, backend, directory);
  await manager.collections.users.insertOne({ email: 'protected@example.com' });
  await manager.close();

  fs.writeFileSync(path.join(directory, 'fallback.json'), 'bad primary');
  fs.writeFileSync(path.join(directory, 'fallback.json.bak'), 'bad backup');
  const broken = new HybridMongoDatabase({
    mongoUri: 'mongodb://test.invalid:27017',
    dbName: 'business_discovery',
    jsonFallbackDir: directory
  }, { clientFactory: createClientFactory(backend), logger: quietLogger, autoReconnect: false });
  await assert.rejects(broken.start(), (error) => error.code === 'fallback_state_corrupt');
  await broken.close();
});
