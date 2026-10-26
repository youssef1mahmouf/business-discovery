const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../src/server');

const secureSecret = 'a'.repeat(40);

test('production requires MONGODB_URI', () => {
  assert.throws(
    () => validateConfig({ NODE_ENV: 'production', TOKEN_SECRET: secureSecret, FRONTEND_ORIGIN: 'https://example.com' }),
    /MONGODB_URI is required/
  );
});

test('production rejects the insecure default token secret', () => {
  assert.throws(
    () => validateConfig({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/test',
      TOKEN_SECRET: 'dev-only-change-me',
      FRONTEND_ORIGIN: 'https://example.com'
    }),
    /insecure development default/
  );
});

test('production requires an explicit HTTPS frontend origin', () => {
  assert.throws(
    () => validateConfig({
      NODE_ENV: 'production',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/test',
      TOKEN_SECRET: secureSecret,
      FRONTEND_ORIGIN: '*'
    }),
    /FRONTEND_ORIGIN must be explicitly configured/
  );
});

test('development uses safe local defaults when optional values are absent', () => {
  const config = validateConfig({ MONGODB_URI: 'mongodb://127.0.0.1:27017/test' });
  assert.equal(config.tokenSecret, 'dev-only-change-me');
  assert.equal(config.frontendOrigin, '*');
  assert.equal(config.dbName, 'business_discovery');
});
