const { sendEmail } = require('./_mailer');

// In-memory sliding rate-limiter: max 5 requests per 10 minutes per IP
const rateMap = new Map();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

function isRateLimited(ip) {
  const now = Date.now();
  const history = rateMap.get(ip) || [];
  const recent = history.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    rateMap.set(ip, recent);
    return true;
  }
  recent.push(now);
  rateMap.set(ip, recent);
  return false;
}

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

function sanitize(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress || '127.0.0.1';

  if (isRateLimited(ip)) {
    res.statusCode = 429;
    return res.end(JSON.stringify({
      error: 'Too many messages sent. Please wait a few minutes before trying again.'
    }));
  }

  try {
    const body = await parseBody(req);
    const { name, email, subject, message, hp } = body;

    // Spam honeypot: if hp is filled, silently discard without error
    if (hp) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ success: true, message: 'Message sent successfully.' }));
    }

    // Validation
    const cleanEmail = (typeof email === 'string' ? email.trim() : '');
    const cleanSubject = (typeof subject === 'string' ? subject.trim() : '');
    const cleanMessage = (typeof message === 'string' ? message.trim() : '');
    const cleanName = (typeof name === 'string' ? name.trim() : '');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'A valid email address is required.' }));
    }

    if (!cleanSubject || cleanSubject.length < 2) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Subject is required.' }));
    }

    if (!cleanMessage || cleanMessage.length < 5) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Message must be at least 5 characters long.' }));
    }

    if (cleanMessage.length > 5000) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ error: 'Message cannot exceed 5000 characters.' }));
    }

    const recipient = process.env.RECIPIENT_EMAIL || 'akhimarepalli666@gmail.com';
    const senderDisplay = cleanName ? `${cleanName} <${cleanEmail}>` : cleanEmail;

    const emailText = `New Hire Me / Inquiry Message from Portfolio:

Sender: ${cleanName ? cleanName + ' (' + cleanEmail + ')' : cleanEmail}
Subject: ${cleanSubject}

Message:
${cleanMessage}

---
Received at: ${new Date().toISOString()}
Reply directly to this email to contact the sender.`;

    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;line-height:1.6;color:#1e293b;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">
  <div style="background:#0f172a;color:#f8fafc;padding:16px 20px;border-radius:6px;margin-bottom:20px;">
    <h2 style="margin:0;font-size:20px;color:#8fdde6;">🚀 New Portfolio Hire Me Message</h2>
  </div>
  <p><strong>From:</strong> ${sanitize(senderDisplay)}</p>
  <p><strong>Subject:</strong> ${sanitize(cleanSubject)}</p>
  <hr style="border:0;border-top:1px solid #e2e8f0;margin:20px 0;">
  <h3 style="margin-top:0;font-size:16px;color:#334155;">Message Content:</h3>
  <div style="background:#f1f5f9;padding:16px;border-radius:6px;white-space:pre-wrap;font-size:15px;">${sanitize(cleanMessage)}</div>
  <p style="font-size:13px;color:#64748b;margin-top:24px;">
    You can reply directly to this email to reach <strong>${sanitize(cleanEmail)}</strong>.
  </p>
</body>
</html>`;

    const result = await sendEmail({
      to: recipient,
      replyTo: cleanEmail,
      subject: `[Portfolio Inquiry] ${cleanSubject}`,
      text: emailText,
      html: emailHtml
    });

    res.statusCode = 200;
    return res.end(JSON.stringify({
      success: true,
      message: 'Message delivered successfully.',
      provider: result.provider
    }));
  } catch (err) {
    console.error('[API Contact] Delivery error:', err.message);
    let userMsg = err.message || 'Unable to transmit message. Please try again later.';
    if (/534.*Application-specific password/i.test(err.message) || /InvalidSecondFactor/i.test(err.message)) {
      userMsg = 'Google SMTP security requires a 16-character App Password (not your regular account password). Please generate one at https://myaccount.google.com/apppasswords and update SMTP_PASS in .env.';
    }
    res.statusCode = 500;
    return res.end(JSON.stringify({
      error: userMsg
    }));
  }
};
