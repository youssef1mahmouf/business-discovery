const buckets = new Map();
function rateLimit(req, res, windowMs, max) {
  const key = (req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown') + ':' + req.url;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; }
  b.count++;
  buckets.set(key, b);
  if (b.count > max) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'rate_limited' }));
    return false;
  }
  return true;
}
module.exports = { rateLimit };