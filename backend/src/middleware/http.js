function sendJson(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' };
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  res.writeHead(status, headers);
  res.end(JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) { reject(new Error('body_too_large')); req.destroy(); }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function getToken(req) {
  const a = req.headers.authorization || '';
  return a.startsWith('Bearer ') ? a.slice(7) : null;
}

module.exports = { sendJson, parseBody, getToken };
