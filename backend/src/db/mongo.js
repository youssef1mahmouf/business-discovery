const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');
const { JsonFallbackStore } = require('./fallback-store');
const {
  HybridCollection,
  aggregateDocuments,
  applyFindOptions,
  applyUpdate,
  assertUnique,
  baseDocument,
  clone,
  deepEqual,
  idKey,
  matches
} = require('./hybrid-collection');

const COLLECTION_NAMES = [
  'users', 'user_states', 'friend_requests', 'friendships', 'partner_invites',
  'partnerships', 'app_settings', 'projects', 'project_members', 'participants',
  'tasks', 'notifications', 'conversations', 'messages', 'ai_conversations',
  'project_assessments', 'products', 'orders'
];

const NETWORK_ERROR_CODES = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
  'EAI_AGAIN', 'ENOTFOUND', 'ECONNABORTED'
]);
const NETWORK_ERROR_NAMES = new Set([
  'MongoNetworkError', 'MongoServerSelectionError', 'MongoNetworkTimeoutError',
  'MongoNetworkInterfaceError', 'MongoNotConnectedError', 'MongoServerClosedError',
  'MongoTopologyClosedError', 'MongoWaitQueueTimeoutError'
]);

let activeManager = null;

function logEvent(logger, level, event, details = {}) {
  const record = JSON.stringify({ component: 'mongo-json-sync', event, ...details });
  if (logger && typeof logger[level] === 'function') logger[level](record);
}

function isConnectivityError(error) {
  if (!error) return false;
  if (NETWORK_ERROR_NAMES.has(error.name) || NETWORK_ERROR_CODES.has(error.code)) return true;
  return error.cause ? isConnectivityError(error.cause) : false;
}

function errorCode(error) {
  return String(error && (error.code || error.name) || 'unknown_error');
}

function collectionDocuments(state, name) {
  if (!Array.isArray(state.collections[name])) state.collections[name] = [];
  return state.collections[name];
}

function replaceDocument(documents, id, replacement) {
  const index = documents.findIndex((document) => deepEqual(document._id, id));
  if (replacement === null) {
    if (index >= 0) documents.splice(index, 1);
  } else if (index >= 0) {
    documents[index] = clone(replacement);
  } else {
    documents.push(clone(replacement));
  }
}

function preimageFilter(document) {
  const filter = {};
  for (const [key, value] of Object.entries(document)) filter[key] = clone(value);
  return filter;
}

function queryError(errorCodeValue, message) {
  const error = new Error(message);
  error.code = errorCodeValue;
  return error;
}

class HybridMongoDatabase {
  constructor(config, options = {}) {
    this.config = config;
    this.logger = options.logger || console;
    this.clientFactory = options.clientFactory ||
      ((uri, clientOptions) => new MongoClient(uri, clientOptions));
    this.autoReconnect = options.autoReconnect !== false;
    this.serverSelectionTimeoutMS = options.serverSelectionTimeoutMS || 3000;
    this.reconnectDelayMs = options.reconnectDelayMs || 1000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs || 30000;
    this.store = options.store || new JsonFallbackStore(
      config.jsonFallbackDir || path.join(__dirname, '..', '..', 'data', 'fallback'),
      { logger: this.logger }
    );
    this.client = null;
    this.db = null;
    this.rawCollections = new Map();
    this.collections = Object.fromEntries(
      COLLECTION_NAMES.map((name) => [name, new HybridCollection(this, name)])
    );
    this.connected = false;
    this.mongoReady = false;
    this.closed = false;
    this.reconnectTimer = null;
    this.queue = Promise.resolve();
    this.lastError = null;
    this.lastSyncAt = null;
  }

  enqueue(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async start() {
    await this.store.initialize();
    await this.enqueue(() => this.connectAndRecover());
    if (!this.connected) this.scheduleReconnect();
    return this;
  }

  async connectAndRecover(options = {}) {
    if (this.closed) return false;
    let candidate;
    try {
      candidate = this.clientFactory(this.config.mongoUri, {
        serverSelectionTimeoutMS: this.serverSelectionTimeoutMS,
        connectTimeoutMS: this.serverSelectionTimeoutMS
      });
      await candidate.connect();
      await candidate.db('admin').command({ ping: 1 });
      const database = candidate.db(this.config.dbName);
      const rawCollections = new Map(COLLECTION_NAMES.map((name) => [name, database.collection(name)]));

      this.client = candidate;
      this.db = database;
      this.rawCollections = rawCollections;
      this.connected = true;
      await this.ensureIndexes();
      await this.refreshSnapshot();
      const outcomes = await this.syncPendingInternal({ retryConflicts: options.retryConflicts === true });
      const state = await this.store.read();
      this.mongoReady = this.connected && state.pending.length === 0;
      this.lastError = this.mongoReady ? null : this.lastError;
      this.reconnectDelayMs = 1000;
      if (this.mongoReady) this.lastSyncAt = new Date().toISOString();
      logEvent(this.logger, 'info', 'mongo_connected', {
        storage: this.mongoReady ? 'mongodb' : 'json_fallback',
        pendingRecords: state.pending.length,
        conflicts: state.pending.filter((entry) => entry.status === 'conflict').length,
        synchronized: Array.from(outcomes.values()).filter((value) => value === 'synced').length
      });
      return true;
    } catch (error) {
      if (candidate && candidate !== this.client) await this.closeClient(candidate);
      await this.markOffline(error, 'connection_failed');
      return false;
    }
  }

  async ensureIndexes() {
    await this.rawCollections.get('users').createIndex({ email: 1 }, { unique: true });
    await this.rawCollections.get('users').createIndex({ username: 1 }, { unique: true, sparse: true });
    await this.rawCollections.get('friend_requests').createIndex(
      { from: 1, to: 1, type: 1 }, { unique: true }
    );
    await this.rawCollections.get('ai_conversations').createIndex(
      { userEmail: 1, projectId: 1, type: 1, createdAt: -1 }
    );
  }

  async refreshSnapshot() {
    const snapshots = new Map();
    for (const name of COLLECTION_NAMES) {
      const documents = await this.rawCollections.get(name).find({}).toArray();
      if (documents.some((document) => !document || document._id === undefined)) {
        throw queryError('fallback_missing_id', 'MongoDB snapshot contains a record without _id.');
      }
      snapshots.set(name, documents.map(clone));
    }
    await this.store.transact((state) => {
      let changed = false;
      for (const [name, remoteDocuments] of snapshots) {
        const remoteById = new Map(remoteDocuments.map((document) => [idKey(document._id), clone(document)]));
        const pending = state.pending.filter((entry) => entry.collection === name)
          .sort((left, right) => left.sequence - right.sequence);
        for (const entry of pending) {
          const key = idKey(entry.id);
          if (entry.after === null) remoteById.delete(key);
          else remoteById.set(key, clone(entry.after));
        }
        const merged = Array.from(remoteById.values());
        if (!deepEqual(state.collections[name] || [], merged)) changed = true;
        state.collections[name] = merged;
      }
      return { changed, value: true };
    });
    logEvent(this.logger, 'info', 'snapshot_refreshed', { collections: snapshots.size });
  }

  async canUseMongo() {
    if (!this.connected) return false;
    const state = await this.store.read();
    if (state.pending.length) {
      this.mongoReady = false;
      await this.syncPendingInternal();
      const current = await this.store.read();
      this.mongoReady = this.connected && current.pending.length === 0;
      return this.mongoReady;
    }
    this.mongoReady = true;
    return true;
  }

  async markOffline(error, event = 'mongo_unavailable') {
    const wasConnected = this.connected;
    this.connected = false;
    this.mongoReady = false;
    this.lastError = errorCode(error);
    const oldClient = this.client;
    this.client = null;
    this.db = null;
    this.rawCollections.clear();
    if (wasConnected || event === 'connection_failed') {
      logEvent(this.logger, 'error', event, { error: this.lastError });
    }
    if (oldClient) await this.closeClient(oldClient);
    this.scheduleReconnect();
  }

  async closeClient(client) {
    try { await client.close(); } catch (error) {
      logEvent(this.logger, 'warn', 'mongo_client_close_failed', { error: errorCode(error) });
    }
  }

  scheduleReconnect() {
    if (!this.autoReconnect || this.closed || this.reconnectTimer) return;
    const delay = this.reconnectDelayMs;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxReconnectDelayMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.enqueue(() => this.connectAndRecover())
        .then((connected) => { if (!connected) this.scheduleReconnect(); })
        .catch((error) => {
          logEvent(this.logger, 'error', 'reconnect_attempt_failed', { error: errorCode(error) });
          this.scheduleReconnect();
        });
    }, delay);
    if (typeof this.reconnectTimer.unref === 'function') this.reconnectTimer.unref();
  }

  async readFallback(name, query, options) {
    const state = await this.store.read();
    const documents = (state.collections[name] || []).filter((document) => matches(document, query));
    return applyFindOptions(documents, options);
  }

  async find(name, query = {}, options = {}) {
    return this.enqueue(async () => {
      if (await this.canUseMongo()) {
        try {
          const documents = await this.rawCollections.get(name).find(query).toArray();
          const mirrored = await this.store.transact((state) => {
            if (state.pending.length) return { changed: false, value: false };
            const existing = collectionDocuments(state, name);
            for (const document of documents) replaceDocument(existing, document._id, document);
            return { changed: documents.length > 0, value: true };
          });
          if (mirrored) return applyFindOptions(documents, options);
          this.mongoReady = false;
        } catch (error) {
          if (!isConnectivityError(error)) throw error;
          await this.markOffline(error);
        }
      }
      return this.readFallback(name, query, options);
    });
  }

  async findOne(name, query = {}, options = {}) {
    const documents = await this.find(name, query, { ...options, limit: 1 });
    return documents[0] || null;
  }

  async countDocuments(name, query = {}) {
    const documents = await this.find(name, query);
    return documents.length;
  }

  async aggregate(name, pipeline = [], options = {}) {
    return this.enqueue(async () => {
      if (await this.canUseMongo()) {
        try {
          return await this.rawCollections.get(name).aggregate(pipeline, options).toArray();
        } catch (error) {
          if (!isConnectivityError(error)) throw error;
          await this.markOffline(error);
        }
      }
      const state = await this.store.read();
      return aggregateDocuments(state.collections[name] || [], pipeline);
    });
  }

  async appendMutation(name, before, after, operation, requireClean = false) {
    return this.store.transact((state) => {
      const hadPending = state.pending.length > 0;
      if (requireClean && hadPending) return { changed: false, value: { requiresFallback: true } };
      const documents = collectionDocuments(state, name);
      if (after !== null) assertUnique(name, documents, after, before !== null);
      const id = (after || before)._id;
      replaceDocument(documents, id, after);
      const event = {
        sequence: state.nextSequence++,
        collection: name,
        id: clone(id),
        before: before === null ? null : clone(before),
        after: after === null ? null : clone(after),
        operation,
        status: 'pending',
        attempts: 0,
        createdAt: new Date().toISOString()
      };
      state.pending.push(event);
      return {
        changed: true,
        value: { sequence: event.sequence, hadPending }
      };
    });
  }

  async settleMutation(sequence, wasReady) {
    if (!wasReady || !this.connected) return;
    const outcomes = await this.syncPendingInternal();
    if (outcomes.get(sequence) === 'duplicate_key') {
      const state = await this.store.read();
      const event = state.pending.find((entry) => entry.sequence === sequence);
      if (event) {
        await this.rollbackEvent(event);
        const error = new Error('Duplicate key.');
        error.name = 'MongoServerError';
        error.code = 11000;
        error.keyPattern = event.keyPattern || {};
        throw error;
      }
    }
  }

  async rollbackEvent(event) {
    await this.store.transact((state) => {
      const currentIndex = state.pending.findIndex((entry) => entry.sequence === event.sequence);
      if (currentIndex < 0) return { changed: false };
      const hasLaterMutation = state.pending.some((entry) =>
        entry.collection === event.collection && deepEqual(entry.id, event.id) &&
        entry.sequence > event.sequence
      );
      if (hasLaterMutation) return { changed: false };
      state.pending.splice(currentIndex, 1);
      replaceDocument(collectionDocuments(state, event.collection), event.id, event.before);
      return { changed: true };
    });
  }

  async insertOne(name, document) {
    return this.enqueue(async () => {
      const ready = await this.canUseMongo();
      const candidate = clone(document);
      if (candidate._id === undefined) candidate._id = new ObjectId();
      const saved = await this.appendMutation(name, null, candidate, 'insert', false);
      if (saved.hadPending) this.mongoReady = false;
      await this.settleMutation(saved.sequence, ready && !saved.hadPending);
      return { acknowledged: true, insertedId: clone(candidate._id) };
    });
  }

  async insertMany(name, documents, options = {}) {
    return this.enqueue(async () => {
      if (!Array.isArray(documents)) throw new TypeError('insertMany expects an array.');
      const insertedIds = {};
      let insertedCount = 0;
      for (let index = 0; index < documents.length; index += 1) {
        try {
          const result = await this.insertOneInternal(name, documents[index]);
          insertedIds[index] = result.insertedId;
          insertedCount += 1;
        } catch (error) {
          if (options.ordered === false) continue;
          error.result = { insertedCount, insertedIds };
          throw error;
        }
      }
      return { acknowledged: true, insertedCount, insertedIds };
    });
  }

  async insertOneInternal(name, document) {
    const ready = await this.canUseMongo();
    const candidate = clone(document);
    if (candidate._id === undefined) candidate._id = new ObjectId();
    const saved = await this.appendMutation(name, null, candidate, 'insert', false);
    if (saved.hadPending) this.mongoReady = false;
    await this.settleMutation(saved.sequence, ready && !saved.hadPending);
    return { insertedId: clone(candidate._id) };
  }

  async loadTargets(name, query, multiple) {
    if (await this.canUseMongo()) {
      try {
        const raw = this.rawCollections.get(name);
        return { online: true, documents: multiple
          ? await raw.find(query).toArray()
          : [await raw.findOne(query)].filter(Boolean) };
      } catch (error) {
        if (!isConnectivityError(error)) throw error;
        await this.markOffline(error);
      }
    }
    const state = await this.store.read();
    const found = (state.collections[name] || []).filter((document) => matches(document, query));
    return { online: false, documents: multiple ? found : found.slice(0, 1) };
  }

  async mutateOne(name, query, update, options, operation) {
    const targets = await this.loadTargets(name, query, false);
    const before = targets.documents[0] || null;
    if (!before && !options.upsert) return {
      acknowledged: true, matchedCount: 0, modifiedCount: 0, upsertedCount: 0
    };
    let base = before ? clone(before) : baseDocument(query);
    if (base._id === undefined) base._id = new ObjectId();
    const after = applyUpdate(base, update, !before);
    after._id = base._id;
    if (deepEqual(before, after)) return {
      acknowledged: true, matchedCount: before ? 1 : 0, modifiedCount: 0,
      upsertedCount: before ? 0 : 1, ...(before ? {} : { upsertedId: clone(after._id) })
    };
    const saved = await this.appendMutation(name, before, after, operation, targets.online);
    if (saved.requiresFallback) {
      this.mongoReady = false;
      return this.mutateOne(name, query, update, options, operation);
    }
    await this.settleMutation(saved.sequence, targets.online && !saved.hadPending);
    return {
      acknowledged: true,
      matchedCount: before ? 1 : 0,
      modifiedCount: 1,
      upsertedCount: before ? 0 : 1,
      ...(before ? {} : { upsertedId: clone(after._id) })
    };
  }

  updateOne(name, query, update, options = {}) {
    return this.enqueue(() => this.mutateOne(name, query, update, options, 'updateOne'));
  }

  async mutateMany(name, query, update, options, operation) {
    const targets = await this.loadTargets(name, query, true);
    if (!targets.documents.length && options.upsert) {
      return this.mutateOne(name, query, update, options, operation);
    }
    const savedEvents = [];
    for (const before of targets.documents) {
      const after = applyUpdate(before, update, false);
      after._id = before._id;
      if (deepEqual(before, after)) continue;
      const saved = await this.appendMutation(name, before, after, operation, false);
      savedEvents.push(saved);
    }
    if (targets.online && savedEvents.length) await this.settleMutation(savedEvents[0].sequence, true);
    return {
      acknowledged: true,
      matchedCount: targets.documents.length,
      modifiedCount: savedEvents.length,
      upsertedCount: 0
    };
  }

  updateMany(name, query, update, options = {}) {
    return this.enqueue(() => this.mutateMany(name, query, update, options, 'updateMany'));
  }

  async deleteOne(name, query) {
    return this.enqueue(async () => {
      const targets = await this.loadTargets(name, query, false);
      const before = targets.documents[0] || null;
      if (!before) return { acknowledged: true, deletedCount: 0 };
      const saved = await this.appendMutation(name, before, null, 'deleteOne', false);
      if (saved.hadPending) this.mongoReady = false;
      if (saved.requiresFallback) {
        this.mongoReady = false;
        return this.deleteOneInternal(name, query);
      }
      await this.settleMutation(saved.sequence, targets.online && !saved.hadPending);
      return { acknowledged: true, deletedCount: 1 };
    });
  }

  async deleteOneInternal(name, query) {
    const state = await this.store.read();
    const before = (state.collections[name] || []).find((document) => matches(document, query));
    if (!before) return { acknowledged: true, deletedCount: 0 };
    await this.appendMutation(name, before, null, 'deleteOne', false);
    return { acknowledged: true, deletedCount: 1 };
  }

  async deleteMany(name, query) {
    return this.enqueue(async () => {
      const targets = await this.loadTargets(name, query, true);
      if (!targets.documents.length) return { acknowledged: true, deletedCount: 0 };
      const savedEvents = [];
      for (const before of targets.documents) {
        const saved = await this.appendMutation(name, before, null, 'deleteMany', false);
        savedEvents.push(saved);
      }
      if (targets.online) await this.settleMutation(savedEvents[0].sequence, true);
      return { acknowledged: true, deletedCount: targets.documents.length };
    });
  }

  async deleteManyInternal(name, query) {
    const state = await this.store.read();
    const targets = (state.collections[name] || []).filter((document) => matches(document, query));
    for (const before of targets) await this.appendMutation(name, before, null, 'deleteMany', false);
    return { acknowledged: true, deletedCount: targets.length };
  }

  async syncPendingInternal(options = {}) {
    if (!this.connected) return new Map();
    this.mongoReady = false;
    if (options.retryConflicts) {
      await this.store.transact((state) => {
        let changed = false;
        for (const entry of state.pending) {
          if (entry.status === 'conflict') {
            entry.status = 'pending';
            delete entry.lastError;
            changed = true;
          }
        }
        return { changed };
      });
    }

    const outcomes = new Map();
    const blockedDocuments = new Set();
    let lastSequence = 0;
    let interrupted = false;
    while (!interrupted) {
      const state = await this.store.read();
      const events = state.pending
        .filter((event) => event.sequence > lastSequence)
        .sort((left, right) => left.sequence - right.sequence);
      if (!events.length) break;

      for (const event of events) {
        lastSequence = event.sequence;
        const documentKey = event.collection + ':' + idKey(event.id);
        if (blockedDocuments.has(documentKey)) {
          await this.markConflict(event, 'blocked_by_prior_conflict');
          outcomes.set(event.sequence, 'conflict');
          continue;
        }
        if (event.status === 'conflict' && !options.retryConflicts) {
          blockedDocuments.add(documentKey);
          outcomes.set(event.sequence, 'conflict');
          continue;
        }
        try {
          const result = await this.syncEvent(event);
          if (result === 'synced') {
            await this.acknowledgeEvent(event);
            outcomes.set(event.sequence, 'synced');
          } else {
            await this.markConflict(event, result);
            blockedDocuments.add(documentKey);
            outcomes.set(event.sequence, result === 'duplicate_key' ? result : 'conflict');
          }
        } catch (error) {
          if (isConnectivityError(error)) {
            await this.recordRetry(event, error);
            outcomes.set(event.sequence, 'retry');
            await this.markOffline(error, 'sync_interrupted');
            interrupted = true;
            break;
          }
          if (error && error.code === 11000) {
            await this.markConflict(event, 'duplicate_key', error.keyPattern);
            blockedDocuments.add(documentKey);
            outcomes.set(event.sequence, 'duplicate_key');
            continue;
          }
          await this.markConflict(event, errorCode(error));
          blockedDocuments.add(documentKey);
          outcomes.set(event.sequence, 'conflict');
        }
      }
    }
    const finalState = await this.store.read();
    this.mongoReady = this.connected && finalState.pending.length === 0;
    if (this.mongoReady) {
      this.lastError = null;
      this.lastSyncAt = new Date().toISOString();
      logEvent(this.logger, 'info', 'sync_completed', {
        synchronized: Array.from(outcomes.values()).filter((value) => value === 'synced').length,
        pendingRecords: 0
      });
    }
    return outcomes;
  }

  async syncEvent(event) {
    const collection = this.rawCollections.get(event.collection);
    if (!collection) throw queryError('fallback_unknown_collection', 'Unknown MongoDB collection.');
    let current = await collection.findOne({ _id: event.id });
    if (event.after === null && !current) return 'synced';
    if (event.after !== null && current && deepEqual(current, event.after)) return 'synced';
    if (!deepEqual(current, event.before)) return 'mongo_conflict';

    if (event.after === null) {
      await collection.deleteOne(preimageFilter(event.before));
    } else if (event.before === null) {
      try {
        await collection.insertOne(clone(event.after));
      } catch (error) {
        if (!(error && error.code === 11000)) throw error;
        current = await collection.findOne({ _id: event.id });
        if (current && deepEqual(current, event.after)) return 'synced';
        throw error;
      }
    } else {
      await collection.replaceOne(preimageFilter(event.before), clone(event.after), { upsert: false });
    }

    current = await collection.findOne({ _id: event.id });
    if (event.after === null ? !current : current && deepEqual(current, event.after)) return 'synced';
    if (current && deepEqual(current, event.after)) return 'synced';
    return 'verification_failed';
  }

  async acknowledgeEvent(event) {
    await this.store.transact((state) => {
      const index = state.pending.findIndex((entry) => entry.sequence === event.sequence);
      if (index < 0) return { changed: false };
      state.pending.splice(index, 1);
      return { changed: true };
    });
    logEvent(this.logger, 'info', 'record_verified', {
      collection: event.collection,
      sequence: event.sequence
    });
  }

  async markConflict(event, reason, keyPattern) {
    await this.store.transact((state) => {
      const entry = state.pending.find((item) => item.sequence === event.sequence);
      if (!entry || (entry.status === 'conflict' && entry.lastError === reason)) {
        return { changed: false };
      }
      entry.status = 'conflict';
      entry.lastError = reason;
      if (keyPattern) entry.keyPattern = clone(keyPattern);
      entry.lastAttemptAt = new Date().toISOString();
      return { changed: true };
    });
    this.lastError = reason;
    logEvent(this.logger, 'error', 'sync_conflict', {
      collection: event.collection,
      sequence: event.sequence,
      error: reason
    });
  }

  async recordRetry(event, error) {
    await this.store.transact((state) => {
      const entry = state.pending.find((item) => item.sequence === event.sequence);
      if (!entry) return { changed: false };
      entry.attempts = (entry.attempts || 0) + 1;
      entry.lastError = errorCode(error);
      entry.lastAttemptAt = new Date().toISOString();
      entry.nextAttemptAt = new Date(Date.now() + Math.min(30000, 1000 * (2 ** Math.min(entry.attempts, 5)))).toISOString();
      return { changed: true };
    });
    logEvent(this.logger, 'warn', 'sync_retry_scheduled', {
      collection: event.collection,
      sequence: event.sequence,
      error: errorCode(error)
    });
  }

  async status() {
    const state = await this.store.read();
    const conflicts = state.pending.filter((entry) => entry.status === 'conflict').length;
    return {
      mongoConnected: this.connected,
      mongoUsable: this.mongoReady && state.pending.length === 0,
      storage: this.mongoReady && state.pending.length === 0 ? 'mongodb' : 'json_fallback',
      pendingRecords: state.pending.length,
      conflictedRecords: conflicts,
      lastSyncAt: this.lastSyncAt,
      lastError: this.lastError,
      fallbackDirectory: this.store.directory
    };
  }

  async retrySync() {
    return this.enqueue(async () => {
      if (!this.connected) await this.connectAndRecover({ retryConflicts: true });
      else await this.syncPendingInternal({ retryConflicts: true });
      return this.status();
    });
  }

  async close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    await this.enqueue(async () => {
      this.mongoReady = false;
      this.connected = false;
      const client = this.client;
      this.client = null;
      this.db = null;
      this.rawCollections.clear();
      if (client) await this.closeClient(client);
    });
  }
}

async function connect(config, options = {}) {
  if (activeManager) await activeManager.close();
  const manager = new HybridMongoDatabase(config, options);
  activeManager = manager;
  await manager.start();
  return {
    client: manager.client,
    db: manager.db,
    collections: manager.collections,
    manager,
    getStatus: () => manager.status(),
    retrySync: () => manager.retrySync()
  };
}

function getDb() { return activeManager && activeManager.db; }
function get(name) { return activeManager && activeManager.collections[name]; }
function getStatus() {
  return activeManager ? activeManager.status() : Promise.resolve({
    mongoConnected: false, mongoUsable: false, storage: 'uninitialized',
    pendingRecords: 0, conflictedRecords: 0, lastSyncAt: null, lastError: null
  });
}
function retrySync() {
  return activeManager ? activeManager.retrySync() : Promise.reject(new Error('Database adapter is not initialized.'));
}
async function close() {
  if (activeManager) await activeManager.close();
  activeManager = null;
}

module.exports = {
  COLLECTION_NAMES,
  HybridMongoDatabase,
  connect,
  getDb,
  get,
  getStatus,
  retrySync,
  close,
  isConnectivityError
};
