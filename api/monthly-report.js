const { getVisitCount, markReportSent, getPreviousMonthKey, getCurrentMonthKey } = require('./_store');
const { sendEmail } = require('./_mailer');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  // Security check: if CRON_SECRET is configured, check Authorization header or query param
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const queryKey = url.searchParams.get('key');

    if (token !== process.env.CRON_SECRET && queryKey !== process.env.CRON_SECRET) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ error: 'Unauthorized: Invalid or missing CRON_SECRET' }));
    }
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    // Optional ?force=true allows manual testing even if reportSent is true
    const force = url.searchParams.get('force') === 'true';
    // Target month: default to previous month if run at start of month, or ?month=YYYY-MM
    let targetMonth = url.searchParams.get('month');
    if (!targetMonth) {
      // If run on the 1st day of month (or early in month), report previous completed month
      const day = new Date().getUTCDate();
      targetMonth = day <= 5 ? getPreviousMonthKey() : getCurrentMonthKey();
    }

    const stats = getVisitCount(targetMonth);

    if (stats.reportSent && !force) {
      res.statusCode = 200;
      return res.end(JSON.stringify({
        success: true,
        sent: false,
        message: `Monthly report for ${targetMonth} has already been sent. Use ?force=true to resend.`
      }));
    }

    const recipient = process.env.RECIPIENT_EMAIL || 'akhimarepalli666@gmail.com';
    const reportDate = new Date().toUTCString();

    const emailSubject = `🚀 Monthly Space Portfolio Report: ${targetMonth}`;
    const emailText = `Space Portfolio - Monthly Astronaut Visitor Report
=====================================================

Report Period: ${targetMonth}
Generated On: ${reportDate}

Visitor Analytics:
- Unique Astronaut Visitors: ${stats.count}

Keep up the stellar work!
Your 3D Space Portfolio Analytics Daemon`;

    const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:'Segoe UI',Helvetica,Arial,sans-serif;line-height:1.6;color:#f1f5f9;background:#03050a;max-width:620px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(135deg,#0d1527,#16233b);border:1px solid #1e293b;border-top:3px solid #8fdde6;border-radius:12px;padding:28px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <span style="font-size:36px;">👨‍🚀</span>
      <h2 style="color:#8fdde6;margin:8px 0 4px;font-size:24px;letter-spacing:-0.02em;">Monthly Space Portfolio Report</h2>
      <p style="color:#94a3b8;font-size:14px;margin:0;">Period: <strong style="color:#f8fafc;">${targetMonth}</strong></p>
    </div>
    
    <div style="background:rgba(3,5,10,0.6);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
      <span style="font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#8fdde6;font-weight:700;">Astronauts Visited</span>
      <div style="font-size:48px;font-weight:700;color:#ffffff;line-height:1.2;margin:4px 0;">${stats.count}</div>
      <span style="font-size:13px;color:#94a3b8;">Unique explorers recorded in orbit this month</span>
    </div>

    <div style="font-size:13px;color:#64748b;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;text-align:center;">
      Generated automatically on ${reportDate}.<br>
      Duplicate prevention: Verified (marked as sent for ${targetMonth}).
    </div>
  </div>
</body>
</html>`;

    const sendRes = await sendEmail({
      to: recipient,
      subject: emailSubject,
      text: emailText,
      html: emailHtml
    });

    markReportSent(targetMonth);

    res.statusCode = 200;
    return res.end(JSON.stringify({
      success: true,
      sent: true,
      month: targetMonth,
      uniqueVisitors: stats.count,
      provider: sendRes.provider
    }));
  } catch (err) {
    console.error('[API Monthly Report] Error:', err.message);
    let userMsg = err.message || 'Failed to generate monthly report';
    if (/534.*Application-specific password/i.test(err.message) || /InvalidSecondFactor/i.test(err.message)) {
      userMsg = 'Google SMTP requires an App Password. Please generate a 16-character App Password at https://myaccount.google.com/apppasswords and update SMTP_PASS in .env.';
    }
    res.statusCode = 500;
    return res.end(JSON.stringify({ error: userMsg }));
  }
};
