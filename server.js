const http = require('http');
const fs = require('fs');
const path = require('path');

// 1. Lightweight zero-dependency .env loader
(function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          let val = trimmed.slice(eqIdx + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (!process.env[key]) process.env[key] = val;
        }
      });
      console.log('[Server] Loaded configuration from .env');
    } catch (e) {
      console.error('[Server] Error loading .env:', e.message);
    }
  }
})();

// Handlers
const visitorsHandler = require('./api/visitors');
const contactHandler = require('./api/contact');
const monthlyReportHandler = require('./api/monthly-report');
const { getPreviousMonthKey, getVisitCount } = require('./api/_store');

const PORT = parseInt(process.env.PORT || '8000', 10);

const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4'
};

function findFile(reqPath) {
  let safePath = (reqPath === '/' || !reqPath) ? 'index.html' : reqPath.replace(/^\/+/, '');
  safePath = path.normalize(safePath).replace(/^(\.\.[\/\\])+/, '');
  const candidates = [
    path.join(__dirname, safePath),
    path.join(process.cwd(), safePath),
    path.resolve(safePath)
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
    } catch (e) {}
  }
  return null;
}

function serveStatic(req, res, filePath) {
  if (!filePath) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    return res.end('404 Not Found');
  }
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Route API requests
  if (pathname === '/api/visitors' || pathname === '/api/visitors/') {
    return visitorsHandler(req, res);
  }
  if (pathname === '/api/contact' || pathname === '/api/contact/') {
    return contactHandler(req, res);
  }
  if (pathname === '/api/monthly-report' || pathname === '/api/monthly-report/') {
    return monthlyReportHandler(req, res);
  }

  // Static files
  const resolvedFile = findFile(pathname);
  serveStatic(req, res, resolvedFile);
});

// 2. Built-in Background Monthly Report Scheduler (for persistent Node deployments)
function checkScheduledMonthlyReport() {
  const d = new Date();
  if (d.getUTCDate() === 1) {
    const prevMonth = getPreviousMonthKey();
    const stats = getVisitCount(prevMonth);
    if (!stats.reportSent) {
      console.log(`[Scheduler] 1st of month detected. Triggering monthly report for ${prevMonth}...`);
      const mockReq = {
        method: 'GET',
        url: `/api/monthly-report?month=${prevMonth}`,
        headers: { host: 'localhost' }
      };
      const mockRes = {
        setHeader: () => {},
        statusCode: 200,
        end: (data) => console.log('[Scheduler] Report result:', data)
      };
      monthlyReportHandler(mockReq, mockRes).catch(err => {
        console.error('[Scheduler] Error sending monthly report:', err.message);
      });
    }
  }
}

// In local mode, start HTTP listener and periodic timer; on Vercel export the server handler
if (require.main === module && !process.env.VERCEL) {
  setInterval(checkScheduledMonthlyReport, 6 * 60 * 60 * 1000);
  server.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Akhil Marepalli Space Portfolio Server`);
    console.log(`🌌 Local URL: http://localhost:${PORT}`);
    console.log(`🛰️  API Endpoints:`);
    console.log(`   - GET/POST /api/visitors`);
    console.log(`   - POST     /api/contact`);
    console.log(`   - GET/POST /api/monthly-report`);
    console.log(`======================================================\n`);
    checkScheduledMonthlyReport();
  });
}

module.exports = server;
