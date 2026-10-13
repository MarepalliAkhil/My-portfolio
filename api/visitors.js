const { recordVisit, getVisitCount, getCurrentMonthKey } = require('./_store');

function parseBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    if (typeof req.body === 'string') {
      try { return resolve(JSON.parse(req.body)); } catch (e) { return resolve({}); }
    }
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch (e) { resolve({}); }
    });
  });
}

module.exports = async function handler(req, res) {
  // CORS & Security headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  try {
    if (req.method === 'GET') {
      const stats = getVisitCount();
      res.statusCode = 200;
      return res.end(JSON.stringify({
        success: true,
        count: stats.count,
        month: stats.month
      }));
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '127.0.0.1';
      const clientVisitorId = (body.visitorId && typeof body.visitorId === 'string')
        ? body.visitorId.slice(0, 64)
        : `anon_${ip}`;

      const result = recordVisit(clientVisitorId);

      res.statusCode = 200;
      return res.end(JSON.stringify({
        success: true,
        count: result.count,
        month: result.month,
        isNew: result.isNew
      }));
    }

    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (err) {
    console.error('[API Visitors] Error:', err);
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: 'Internal server error' }));
  }
};
