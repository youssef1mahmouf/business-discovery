const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/server');
const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/server');
const crypto = require('crypto');

function makeCollection(records = []) {
  return {
    findOne: async (filter) => {
      return records.find(
        (r) => JSON.stringify(r) === JSON.stringify(filter)
      ) || null;
    },
    insertOne: async (record) => {
      records.push(record);
    },
    updateOne: async (filter, update) => {
      const idx = records.findIndex(
        (r) => JSON.stringify(r) === JSON.stringify(filter)
      );
      if (idx >= 0) {
        Object.assign(records[idx], update.$set || update);
      }
    },
  };
}

function makeCtx(overrides = {}) {
  return {
    config: {
      tokenSecret: 'test-secret-key-for-testing-only-changeme',
      frontendOrigin: '*',
      accessTokenTtlSeconds: 900,
      ...overrides.config,
    },
    db: {
      get: (name) => {
        if (name === 'users') return makeCollection(overrides.users || []);
        if (name === 'user_states') return makeCollection(overrides.userStates || []);
        return {};
      },
    },
  };
}
X
const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/server');

const crypto = require('crypto');

// Helper to create a mock collection
function makeCollection(records = []) {
  return {
    findOne: async (filter) => {
      return records.find(
        (r) => JSON.stringify(r) === JSON.stringify(filter)
      ) || null;
    },
    insertOne: async (record) => {
      records.push(record);
    },
    updateOne: async (filter, update) => {
      const idx = records.findIndex(
        (r) => JSON.stringify(r) === JSON.stringify(filter)
      );
      if (idx >= 0) {
        Object.assign(records[idx], update.$set || update);
      }
    },
  };
}

function makeCtx(overrides = {}) {
  return {
    config: {
      tokenSecret: 'test-secret-key-for-testing-only-changeme',
      frontendOrigin: '*',
      accessTokenTtlSeconds: 900,
      ...overrides.config,
    },
    db: {
      get: (name) => {
        if (name === 'users') return makeCollection(overrides.users || []);
        if (name === 'user_states') return makeCollection(overrides.userStates || []);
        return {};
      },
    },
  };
}
const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../src/server');

const crypto = require('crypto');

// Helper to create a mock collection
function makeCollection(records = []) {
  return {
    findOne: async (filter) => {
      return records.find(
        (r) => JSON.stringify(r) === JSON.stringify(filter)
      ) || null;
    },
    insertOne: async (record) => {
      records.push(record);
    },
    updateOne: async (filter, update) => {
      const idx = records.findIndex(
        (r) => JSON.stringify(r) === JSON.stringify(filter)
      );
      if (idx >= 0) {
        Object.assign(records[idx], update.$set || update);
      }
    },
  };
}

function makeCtx(overrides = {}) {
  return {
    config: {
      tokenSecret: 'test-secret-key-for-testing-only-changeme',
      frontendOrigin: '*',
      accessTokenTtlSeconds: 900,
      ...overrides.config,
    },
    db: {
      get: (name) => {
        if (name === 'users') return makeCollection(overrides.users || []);
        if (name === 'user_states') return makeCollection(overrides.userStates || []);
        return {};
      },
    },
  };
}
ctx.db.get = (name) => {
    if (name === 'users') return makeCollection([
      { email: 'test@example.com', passwordHash: hashPassword('oldpassword123') }
    ]);
    if (name === 'user_states') return userStates;
    return {};
  };