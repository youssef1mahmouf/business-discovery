/**
 * Rate limiting and brute-force protection for Business Discovery backend.
 * Uses in-memory buckets (suitable for single-process deployments).
 * For multi-node production, replace with Redis-backed store.
 */

const crypto = require('crypto');

const buckets = new Map();
const failedLogins = new Map(); // identifier -> { count, lockedUntil, lastAttempt }

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_WINDOW_MS = 60 * 60 * 1000; // 1 hour window for tracking failures

function rateLimit(req, res, windowMs, max) {
  const key =
    (req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown') +
    ':' +
    req.url;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) {
    b = { count: 0, reset: now + windowMs };
  }
  b.count++;
  buckets.set(key, b);
  if (b.count > max) {
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': Math.ceil((b.reset - now) / 1000),
    });
    res.end(
      JSON.stringify({
        error: 'rate_limited',
        retryAfter: Math.ceil((b.reset - now) / 1000),
      })
    );
    return false;
  }
  return true;
}

/**
 * Track a failed login attempt for an identifier (email/username).
 * Returns { allowed: boolean, lockedUntil: number|null }.
 */
function recordFailedLogin(identifier) {
  const key = String(identifier || '').trim().toLowerCase();
  const now = Date.now();
  let entry = failedLogins.get(key);
  if (!entry) {
    entry = { count: 0, lockedUntil: 0, lastAttempt: 0 };
    failedLogins.set(key, entry);
  }
  // If lockout expired, reset count
  if (entry.lockedUntil && now > entry.lockedUntil) {
    entry.count = 0;
    entry.lockedUntil = 0;
  }
  entry.count++;
  entry.lastAttempt = now;
  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    entry.lockedUntil = now + LOGIN_LOCKOUT_MS;
    entry.count = 0;
  }
  return { allowed: false, lockedUntil: entry.lockedUntil || 0 };
}

/**
 * Check if an identifier is currently locked out.
 * Returns { locked: boolean, lockedUntil: number|null }.
 */
function isLockedOut(identifier) {
  const key = String(identifier || '').trim().toLowerCase();
  const entry = failedLogins.get(key);
  if (!entry) return { locked: false, lockedUntil: 0 };
  const now = Date.now();
  if (entry.lockedUntil && now < entry.lockedUntil) {
    return { locked: true, lockedUntil: entry.lockedUntil };
  }
  // Lockout expired, clear it
  if (entry.lockedUntil && now >= entry.lockedUntil) {
    entry.count = 0;
    entry.lockedUntil = 0;
    failedLogins.set(key, entry);
  }
  return { locked: false, lockedUntil: 0 };
}

/**
 * Clear failed login record after a successful login.
 */
function clearFailedLogin(identifier) {
  const key = String(identifier || '').trim().toLowerCase();
  failedLogins.delete(key);
}

/**
 * Cleanup old entries periodically to prevent memory leaks.
 */
function cleanup() {
  const now = Date.now();
  const maxAge = LOGIN_WINDOW_MS + LOGIN_LOCKOUT_MS;
  for (const [key, entry] of failedLogins.entries()) {
    if (now - entry.lastAttempt > maxAge) {
      failedLogins.delete(key);
    }
  }
}
// Run cleanup every 10 minutes
setInterval(cleanup, 10 * 60 * 1000);

module.exports = {
  rateLimit,
  recordFailedLogin,
  isLockedOut,
  clearFailedLogin,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCKOUT_MS,
};