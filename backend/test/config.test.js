const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { validateConfig } = require('../src/server');

const secureSecret = 'a'.repeat(40);

test('production requires MONGODB_URI', () => {
  assert.throws(() => validateConfig({ NODE_ENV: 'production', TOKEN_SECRET: secureSecret, FRONTEND_ORIGIN: 'https://example.com' }), /MONGODB_URI is required/);
});

test('production rejects insecure default token secret', () => {
  assert.throws(() => validateConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1:27017/test', TOKEN_SECRET: 'dev-only-change-me', FRONTEND_ORIGIN: 'https://example.com' }), /insecure development default/);
});

test('production requires explicit HTTPS frontend origin', () => {
  assert.throws(() => validateConfig({ NODE_ENV: 'production', MONGODB_URI: 'mongodb://127.0.0.1:27017/test', TOKEN_SECRET: secureSecret, FRONTEND_ORIGIN: '*' }), /FRONTEND_ORIGIN must be explicitly configured/);
});

test('development uses safe local defaults', () => {
  const config = validateConfig({ MONGODB_URI: 'mongodb://127.0.0.1:27017/test' });
  assert.equal(config.tokenSecret, 'dev-only-change-me');
  assert.equal(config.frontendOrigin, '*');
  assert.equal(config.dbName, 'business_discovery');
  assert.equal(config.ollamaModel, 'qwen3:4b');
  assert.equal(config.jsonFallbackDir, path.resolve(__dirname, '..', 'data', 'fallback'));
});

test('relative JSON fallback directory is stable from repository root', () => {
  const config = validateConfig({
    MONGODB_URI: 'mongodb://127.0.0.1:27017/test',
    JSON_FALLBACK_DIR: 'backend/data/recovery'
  });
  assert.equal(config.jsonFallbackDir, path.resolve(__dirname, '..', '..', 'backend', 'data', 'recovery'));
});

test('access token ttl must be valid integer', () => {
  assert.throws(() => validateConfig({ MONGODB_URI: 'mongodb://127.0.0.1:27017/test', ACCESS_TOKEN_TTL_SECONDS: 'abc' }), /ACCESS_TOKEN_TTL_SECONDS/);
  const c = validateConfig({ MONGODB_URI: 'mongodb://127.0.0.1:27017/test', ACCESS_TOKEN_TTL_SECONDS: '120' });
  assert.equal(c.accessTokenTtlSeconds, 120);
});
