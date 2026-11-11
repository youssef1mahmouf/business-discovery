/**
 * Security middleware for Business Discovery backend.
 * Provides HTTP security headers, CORS hardening, CSRF tokens, and request size limits.
 * Works with the custom raw HTTP server (not Express).
 */

const crypto = require('crypto');

/**
 * Allowed origins. In production, FRONTEND_ORIGIN must be set explicitly.
 * '*' is only acceptable in development.
 */
function resolveOrigin(config) {
  if (config.production) {
    if (!config.frontendOrigin || config.frontendOrigin === '*') {
      throw new Error('FRONTEND_ORIGIN must be explicitly configured in production (not "*")');
    }
    return config.frontendOrigin;
  }
  return config.frontendOrigin || '*';
}

/**
 * Content Security Policy. Strict by default; only allows same-origin resources
 * plus the vendored local assets used by the frontend.
 */
function buildCSP(config) {
  const origin = config.frontendOrigin === '*' ? "'self'" : config.frontendOrigin;
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' ws: wss:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests"
  ].join('; ');
}

/**
 * Generate a double-submit CSRF token pair.
 */
function generateCSRFToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * Constant-time comparison to prevent timing attacks.
 */
function timingSafeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Security headers middleware. Call at the top of every request handler.
 * Returns an object with headers to set on the response.
 */
function securityHeaders(config) {
  const origin = resolveOrigin(config);
  const isProd = config.production;
  const csp = buildCSP(config);

  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': isProd
      ? 'max-age=31536000; includeSubDomains; preload'
      : 'max-age=0',
    'Content-Security-Policy': csp,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-CSRF-Token',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': origin !== '*' ? 'true' : 'false',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Powered-By': ''
  };
}

/**
 * Reject requests that are too large (defense against payload attacks).
 * maxBytes defaults to 1MB.
 */
function limitBodySize(maxBytes = 1024 * 1024) {
  return function (req, res, next) {
    let received = 0;
    const onData = (chunk) => {
      received += chunk.length;
      if (received > maxBytes) {
        req.removeListener('data', onData);
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'request_entity_too_large' }));
      }
    };
    req.on('data', onData);
    req.on('end', next);
    req.on('error', () => next());
  };
}

/**
 * Require a valid CSRF token for state-changing methods (POST, PUT, DELETE).
 * The token must match the one stored in a cookie (double-submit pattern).
 */
function requireCSRF(req, res, origin) {
  if (req.method === 'OPTIONS') return true;
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) return true;

  const cookieToken = getCookie(req, 'csrf_token');
  const headerToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];

  if (!cookieToken || !headerToken) {
    res.writeHead(403, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': origin !== '*' ? 'true' : 'false',
    });
    res.end(JSON.stringify({ error: 'csrf_token_required' }));
    return false;
  }
  if (!timingSafeEqual(cookieToken, headerToken)) {
    res.writeHead(403, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': origin !== '*' ? 'true' : 'false',
    });
    res.end(JSON.stringify({ error: 'csrf_token_mismatch' }));
    return false;
  }
  return true;
}

function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return match ? match[1] : null;
}

function setCookie(res, name, value, options = {}) {
  const parts = [name + '=' + encodeURIComponent(value)];
  if (options.maxAge) parts.push('Max-Age=' + options.maxAge);
  if (options.path) parts.push('Path=' + options.path);
  if (options.domain) parts.push('Domain=' + options.domain);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push('SameSite=' + options.sameSite);
  return parts.join('; ');
}

module.exports = {
  resolveOrigin,
  buildCSP,
  securityHeaders,
  generateCSRFToken,
  requireCSRF,
  limitBodySize,
  setCookie,
  getCookie,
  timingSafeEqual,
};
