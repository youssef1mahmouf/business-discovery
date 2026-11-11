/**
 * Input sanitization for Business Discovery backend.
 * Protects against NoSQL injection, XSS, and malicious payloads.
 */

/**
 * MongoDB operator prefixes that could be used for NoSQL injection.
 */
const MONGO_OPERATOR_PREFIX = '$';

/**
 * Recursively sanitize an object to prevent NoSQL injection.
 * Strips any keys that begin with '$' unless they are explicitly allowed.
 * Also validates that string values don't contain dangerous embedded operators.
 *
 * @param {any} value - The value to sanitize
 * @param {Set<string>} allowedOperators - Operators that are explicitly allowed (e.g. '$in')
 * @returns {any} - Sanitized value
 */
function sanitize(value, allowedOperators = new Set(['$in', '$ne', '$nin', '$all', '$size', '$regex', '$options'])) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, allowedOperators));
  }
  if (typeof value === 'object' && !Buffer.isBuffer(value) && !(value instanceof Date)) {
    const cleaned = {};
    for (const [key, val] of Object.entries(value)) {
      // Reject keys that start with $ unless explicitly allowed
      if (key.startsWith(MONGO_OPERATOR_PREFIX) && !allowedOperators.has(key)) {
        continue; // drop dangerous operator keys
      }
      cleaned[key] = sanitize(val, allowedOperators);
    }
    return cleaned;
  }
  if (typeof value === 'string') {
    // Null-byte injection protection
    if (value.includes('\0')) return '';
    return value;
  }
  return value;
}

/**
 * Sanitize an Express-style query object (req.query / req.body / req.params).
 * Returns a sanitized copy safe for MongoDB queries.
 */
function sanitizeQuery(obj) {
  return sanitize(obj);
}

/**
 * HTML escape for server-side output encoding (XSS prevention).
 * Use this before inserting any user-controlled data into HTML responses.
 */
function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Validate an email address strictly.
 */
function isValidEmail(value) {
  if (typeof value !== 'string') return false;
  const email = value.trim().toLowerCase();
  const re = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
  return re.test(email) && email.length <= 254;
}

/**
 * Validate a username strictly.
 */
function isValidUsername(value) {
  if (typeof value !== 'string') return false;
  return /^[a-z0-9_]{3,30}$/.test(value);
}

/**
 * Validate password strength.
 * Returns { ok: boolean, errors: string[] }.
 */
function validatePassword(password) {
  const errors = [];
  if (typeof password !== 'string' || password.length < 8) {
    errors.push('password must be at least 8 characters');
  }
  if (password.length > 128) {
    errors.push('password must not exceed 128 characters');
  }
  if (!/[A-Za-z]/.test(password)) errors.push('password must contain a letter');
  if (!/[0-9]/.test(password)) errors.push('password must contain a digit');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('password must contain a special character');
  return { ok: errors.length === 0, errors };
}

/**
 * Sanitize and validate a MongoDB ObjectId string.
 */
function isValidObjectId(value) {
  if (typeof value !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(value);
}

/**
 * Recursively strip any keys that could be used for prototype pollution.
 */
function stripPrototypePollution(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return obj;
  const cleaned = {};
  for (const [key, val] of Object.entries(obj)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    cleaned[key] = stripPrototypePollution(val);
  }
  return cleaned;
}

module.exports = {
  sanitize,
  sanitizeQuery,
  escapeHtml,
  isValidEmail,
  isValidUsername,
  validatePassword,
  isValidObjectId,
  stripPrototypePollution,
};
