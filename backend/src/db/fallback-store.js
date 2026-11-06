const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { EJSON } = require('bson');

const FORMAT_VERSION = 1;
const LOCK_TIMEOUT_MS = 15000;
const LOCK_STALE_MS = 30000;

function logEvent(logger, level, event, details = {}) {
  const record = JSON.stringify({ component: 'json-fallback', event, ...details });
  if (logger && typeof logger[level] === 'function') logger[level](record);
}

function emptyState() {
  return { version: FORMAT_VERSION, generation: 0, nextSequence: 1, collections: {}, pending: [] };
}

function validateState(state) {
  return !!state && state.version === FORMAT_VERSION &&
    Number.isSafeInteger(state.generation) && state.generation >= 0 &&
    Number.isSafeInteger(state.nextSequence) && state.nextSequence > 0 &&
    state.collections && typeof state.collections === 'object' && !Array.isArray(state.collections) &&
    Array.isArray(state.pending);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class JsonFallbackStore {
  constructor(directory, options = {}) {
    if (!directory) throw new TypeError('A JSON fallback directory is required.');
    this.directory = path.resolve(directory);
    this.filePath = path.join(this.directory, 'fallback.json');
    this.backupPath = this.filePath + '.bak';
    this.lockPath = this.filePath + '.lock';
    this.logger = options.logger || console;
    this.lockTimeoutMs = options.lockTimeoutMs || LOCK_TIMEOUT_MS;
  }

  async initialize() {
    await fs.promises.mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await fs.promises.chmod(this.directory, 0o700);
    await this.transact(() => ({ changed: false }));
  }

  async read() {
    return this.transact((state) => ({
      changed: false,
      value: EJSON.parse(EJSON.stringify(state, null, 0, { relaxed: false }), { relaxed: true })
    }));
  }

  async transact(mutator) {
    const release = await this.acquireLock();
    try {
      const loaded = await this.readBestState();
      const result = await mutator(loaded.state);
      if (result && result.changed) {
        loaded.state.generation += 1;
        await this.writeState(loaded.state);
      } else if (loaded.recovered) {
        await this.writeState(loaded.state);
        logEvent(this.logger, 'warn', 'state_recovered', {
          generation: loaded.state.generation,
          source: loaded.source || 'new_store'
        });
      }
      return result && result.value;
    } finally {
      await release();
    }
  }

  async acquireLock() {
    const token = crypto.randomBytes(16).toString('hex');
    const startedAt = Date.now();
    while (Date.now() - startedAt < this.lockTimeoutMs) {
      let handle;
      try {
        handle = await fs.promises.open(this.lockPath, 'wx', 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid, token, createdAt: new Date().toISOString() }));
        await handle.sync();
        await handle.close();
        handle = null;
        return async () => {
          try {
            const lock = JSON.parse(await fs.promises.readFile(this.lockPath, 'utf8'));
            if (lock.token === token) await fs.promises.unlink(this.lockPath);
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        };
      } catch (error) {
        if (handle) {
          try { await handle.close(); } catch {}
          await this.removeIfPresent(this.lockPath);
        }
        if (error.code !== 'EEXIST') throw error;
        await this.removeStaleLock();
        await sleep(20);
      }
    }
    const error = new Error('Timed out waiting for the JSON fallback lock.');
    error.code = 'fallback_lock_timeout';
    logEvent(this.logger, 'error', 'lock_timeout');
    throw error;
  }

  async removeStaleLock() {
    try {
      const [contents, stat] = await Promise.all([
        fs.promises.readFile(this.lockPath, 'utf8'),
        fs.promises.stat(this.lockPath)
      ]);
      let owner;
      try { owner = JSON.parse(contents); } catch {}
      if (owner && Number.isInteger(owner.pid)) {
        try {
          process.kill(owner.pid, 0);
          return;
        } catch (error) {
          if (error.code !== 'ESRCH' && error.code !== 'EINVAL') return;
        }
      } else if (Date.now() - stat.mtimeMs < LOCK_STALE_MS) {
        return;
      }
      await fs.promises.unlink(this.lockPath);
      logEvent(this.logger, 'warn', 'stale_lock_removed');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async readBestState() {
    const candidates = [];
    let existingFiles = 0;
    for (const candidatePath of [this.filePath, this.backupPath]) {
      try {
        const raw = await fs.promises.readFile(candidatePath, 'utf8');
        existingFiles += 1;
        const envelope = JSON.parse(raw);
        if (!envelope || envelope.format !== FORMAT_VERSION ||
            !Number.isSafeInteger(envelope.generation) || typeof envelope.payload !== 'string' ||
            typeof envelope.checksum !== 'string') {
          throw new Error('Invalid fallback envelope.');
        }
        const checksum = crypto.createHash('sha256').update(envelope.payload).digest('hex');
        if (checksum !== envelope.checksum) throw new Error('Fallback checksum mismatch.');
        const state = EJSON.parse(envelope.payload, { relaxed: true });
        if (!validateState(state) || state.generation !== envelope.generation) {
          throw new Error('Invalid fallback state.');
        }
        candidates.push({ path: candidatePath, state, payload: envelope.payload });
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        logEvent(this.logger, 'error', 'state_file_invalid', {
          file: path.basename(candidatePath),
          error: error.message
        });
      }
    }

    if (!candidates.length && existingFiles) {
      const error = new Error('Both JSON fallback files are corrupt; refusing to initialize empty storage.');
      error.code = 'fallback_state_corrupt';
      throw error;
    }
    if (!candidates.length) return { state: emptyState(), recovered: true, source: 'new_store' };

    candidates.sort((left, right) => right.state.generation - left.state.generation);
    if (candidates.length > 1 && candidates[0].state.generation === candidates[1].state.generation &&
        candidates[0].payload !== candidates[1].payload) {
      const error = new Error('JSON fallback files disagree at the same generation.');
      error.code = 'fallback_state_conflict';
      throw error;
    }
    const selected = candidates[0];
    return {
      state: selected.state,
      recovered: selected.path !== this.filePath || candidates.length < 2,
      source: path.basename(selected.path)
    };
  }

  async writeState(state) {
    const payload = EJSON.stringify(state, null, 2, { relaxed: false });
    const envelope = JSON.stringify({
      format: FORMAT_VERSION,
      generation: state.generation,
      checksum: crypto.createHash('sha256').update(payload).digest('hex'),
      payload
    }, null, 2) + '\n';
    const primaryTemp = this.filePath + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    const backupTemp = this.backupPath + '.' + process.pid + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    try {
      await this.writeSyncedFile(primaryTemp, envelope);
      await this.writeSyncedFile(backupTemp, envelope);
      await this.installFile(backupTemp, this.backupPath);
      await this.installFile(primaryTemp, this.filePath);
      logEvent(this.logger, 'info', 'state_saved', { generation: state.generation });
    } catch (error) {
      await this.removeIfPresent(primaryTemp);
      await this.removeIfPresent(backupTemp);
      logEvent(this.logger, 'error', 'state_write_failed', { error: error.message });
      throw error;
    }
  }

  async writeSyncedFile(filePath, contents) {
    const handle = await fs.promises.open(filePath, 'wx', 0o600);
    try {
      await handle.writeFile(contents, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async installFile(source, target) {
    try {
      await fs.promises.rename(source, target);
    } catch (error) {
      if (!['EEXIST', 'EPERM', 'ENOTEMPTY'].includes(error.code)) throw error;
      await this.removeIfPresent(target);
      await fs.promises.rename(source, target);
    }
  }

  async removeIfPresent(filePath) {
    try { await fs.promises.unlink(filePath); } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

module.exports = { JsonFallbackStore };
