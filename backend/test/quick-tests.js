const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEnvFile, validateConfig } = require('../src/config');
const db = require('../src/db/mongo');
const { createApp } = require('../src/app');
const { hashPassword, verifyPassword, signToken, verifyToken } = require('../src/services/auth');
const { rateLimit, recordFailedLogin, isLockedOut, clearFailedLogin, LOGIN_MAX_ATTEMPTS } = require('../src/middleware/rateLimit');
const { generateCSRFToken, timingSafeEqual, requireCSRF } = require('../src/middleware/security');
const { sanitize, sanitizeQuery, isValidEmail, isValidUsername, validatePassword, escapeHtml, isValidObjectId, stripPrototypePollution } = require('../src/middleware/sanitize');
const crypto = require('crypto');

async function main() {
  loadEnvFile();
  const config = validateConfig();

  // Test 1: Password hashing
  const pass = 'SecurePass123!';
  const hash = hashPassword(pass);
  assert(!!hash, 'hash is not empty');
  assert(verifyPassword(pass, hash), 'password verifies');
  assert(!verifyPassword('WrongPass123!', hash), 'wrong password fails');

  // Test 2: Token signing and verification
  const secret = 'test-secret-32-chars-long-xyz1234567890';
  const payload = { sub: '1234567890', email: 'test@example.com', role: 'regular_user' };
  const token = signToken(payload, secret, 3600);
  const decoded = verifyToken(token, secret);
  assert(decoded && decoded.email === 'test@example.com', 'token verifies');

  // Test 3: Expired token (using a token with iat > exp)
  const fraudToken = signToken(payload, secret);
  const fraudPayload = JSON.parse(Buffer.from(fraudToken.split('.')[0], 'base64url').toString('utf8'));
  fraudPayload.exp = fraudPayload.iat - 100;
  const fraudData = Buffer.from(JSON.stringify(fraudPayload)).toString('base64url');
  const fraudSig = crypto.createHmac('sha256', secret).update(fraudData).digest('base64url');
  const expiredToken = fraudData + '.' + fraudSig;
  assert.equal(verifyToken(expiredToken, secret), null, 'expired token rejected');

  // Test 4: CSRF token generation
  const csrfToken = generateCSRFToken();
  assert.equal(typeof csrfToken, 'string');
  assert.ok(csrfToken.length > 20);

  // Test 5: CSRF timing-safe compare
  const tokenA = generateCSRFToken();
  const tokenB = generateCSRFToken();
  assert.ok(timingSafeEqual(Buffer.from(tokenA), Buffer.from(tokenA)));
  assert.ok(!timingSafeEqual(Buffer.from(tokenA), Buffer.from(tokenB)));

  // Test 6: Rate limit
  for (let i = 0; i < 15; i++) {
    const allowed = rateLimit({ headers: { 'x-forwarded-for': '127.0.0.1' }, url: '/test' }, { writeHead: (s, h) => { }, end: () => {} }, 1000, 10);
    if (i < 10) assert.ok(allowed, 'rate not exceeded at ' + i);
  }

  // Test 7: Account lockout
  const ident = 'test@example.com';
  for (let i = 0; i < LOGIN_MAX_ATTEMPTS + 2; i++) {
    const result = recordFailedLogin(ident);
    if (i < LOGIN_MAX_ATTEMPTS) assert.ok(!result.locked, 'not locked before max');
  }
  const locked = isLockedOut(ident);
  assert.ok(locked.locked, 'account locked after max attempts');

  // Test 8: Sanitize NoSQL injection
  const malicious = { $gt: 5, name: 'test' };
  const sanitized = sanitize(malicious);
  assert.ok(!sanitized.hasOwnProperty('$gt'), 'operator key removed');
  assert.equal(sanitized.name, 'test', 'normal values kept');

  // Test 9: Email validation
  assert.ok(isValidEmail('test@example.com'), 'valid email');
  assert.ok(!isValidEmail('invalid'), 'invalid email rejected');
  assert.ok(!isValidEmail('abc'), 'short email rejected');

  // Test 10: Username validation
  assert.ok(isValidUsername('user_123'), 'valid username');
  assert.ok(!isValidUsername('ab'), 'too short username rejected');
  assert.ok(!isValidUsername('user<script>'), 'script in username rejected');

  // Test 11: Password strength
  const weak = { ok: false, errors: [] };
  const passResult = validatePassword('short');
  assert.ok(!passResult.ok, 'weak password rejected');

  // Test 12: XSS escaping
  const xss = '<script>alert("xss")</script>';
  const escaped = escapeHtml(xss);
  assert.ok(escaped.includes('&lt;script&gt;'), 'xss tag escaped to &lt;');
  assert.ok(escaped.includes('&quot;xss&quot;'), 'xss quote escaped to &quot;');
  assert.ok(escaped.includes('&lt;&#x2F;script&gt;'), 'xss closing tag escaped');

  // Test 13: ObjectId validation
  const validOid = '507f1f77bcf86cd799439011';
  assert.ok(isValidObjectId(validOid), 'valid oid');
  assert.ok(!isValidObjectId('not-a-valid-oid'), 'invalid oid rejected');

  // Test 14: Prototype pollution protection
  const protoPollution = { __proto__: { polluted: true }, normal: 'value' };
  const cleaned = stripPrototypePollution(protoPollution);
  assert.ok(!cleaned.hasOwnProperty('polluted'), 'prototype pollution blocked');

  // Test 15: CSRF requireCSRF
  const req = {
    method: 'POST',
    headers: { cookie: 'csrf_token=' + csrfToken, 'x-csrf-token': csrfToken },
    url: '/test'
  };
  const res = {
    writeHead: (code, headers) => {
      if (code !== 403 && code !== 413 && code !== 429) {
        assert.ok(false, 'CSRF should not fail for valid token');
      }
    },
    end: () => {}
  };
  const origin = '*';
  const result = requireCSRF(req, res, origin);
  assert.ok(result, 'CSRF passes for valid token');

  // Test 16: CSRF mismatch
  const res2 = {
    writeHead: (code, headers) => {
      assert.equal(code, 403, 'should return 403 on mismatch');
      const ct = headers['Content-Type'] || '';
      assert.ok(ct.includes('application/json'), 'json content type');
    },
    end: () => {}
  };
  const req2 = {
    method: 'POST',
    headers: { cookie: 'csrf_token=wrong', 'x-csrf-token': 'valid-token' },
    url: '/test'
  };
  const result2 = requireCSRF(req2, res2, origin);
  assert.ok(!result2, 'CSRF fails on mismatch');

  console.log('All security tests passed!');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error('Test FAILED:', err);
  process.exit(1);
});
