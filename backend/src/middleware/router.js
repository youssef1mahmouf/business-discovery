function createRouter() {
  const routes = [];
  function add(method, pattern, handler) {
    routes.push({ method: method.toUpperCase(), pattern, handler });
  }
  function match(path, pattern) {
    // pattern like /api/users/:id
    const pParts = pattern.split('/');
    const uParts = path.split('/');
    if (pParts.length !== uParts.length) return null;
    const params = {};
    for (let i = 0; i < pParts.length; i++) {
      if (pParts[i].startsWith(':')) {
        params[pParts[i].slice(1)] = decodeURIComponent(uParts[i]);
      } else if (pParts[i] !== uParts[i]) {
        return null;
      }
    }
    return params;
  }
  async function handle(req, res, ctx) {
    const url = req.url.split('?')[0];
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const params = match(url, r.pattern);
      if (params) {
        req.params = params;
        await r.handler(req, res, ctx);
        return true;
      }
    }
    return false;
  }
  return { add, handle, get: (p,h)=>add('GET',p,h), post:(p,h)=>add('POST',p,h), put:(p,h)=>add('PUT',p,h), delete:(p,h)=>add('DELETE',p,h) };
}

module.exports = { createRouter };
