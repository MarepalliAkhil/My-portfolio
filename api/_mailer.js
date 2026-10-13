/**
 * Mailer service supporting Resend, SendGrid, and SMTP integrations.
 * Uses native fetch in Node 18+ to eliminate mandatory third-party package dependencies.
 */

async function sendEmail({ to, replyTo, subject, text, html }) {
  const recipient = to || process.env.RECIPIENT_EMAIL;
  if (!recipient) {
    throw new Error('No recipient email configured. Please set RECIPIENT_EMAIL in environment variables.');
  }

  const fromAddress = process.env.SMTP_FROM || process.env.EMAIL_FROM || 'Portfolio <onboarding@resend.dev>';

  // 1. Resend Integration (Recommended)
  if (process.env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [recipient],
        reply_to: replyTo || undefined,
        subject,
        text,
        html
      })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = data.message || `Resend API returned status ${res.status}`;
      throw new Error(`Resend delivery failed: ${errMsg}`);
    }
    return { success: true, provider: 'resend', id: data.id };
  }

  // 2. SendGrid Integration
  if (process.env.SENDGRID_API_KEY) {
    const payload = {
      personalizations: [{ to: [{ email: recipient }] }],
      from: { email: fromAddress.match(/<([^>]+)>/)?.[1] || fromAddress },
      subject,
      content: [
        { type: 'text/plain', value: text },
        ...(html ? [{ type: 'text/html', value: html }] : [])
      ]
    };
    if (replyTo) {
      payload.reply_to = { email: replyTo };
    }

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`SendGrid delivery failed: HTTP ${res.status} - ${errText}`);
    }
    return { success: true, provider: 'sendgrid' };
  }

  // 3. SMTP Integration (via optional nodemailer)
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      const info = await transporter.sendMail({
        from: fromAddress,
        to: recipient,
        replyTo: replyTo || undefined,
        subject,
        text,
        html
      });
      return { success: true, provider: 'smtp', id: info.messageId };
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND') {
        throw new Error('SMTP configured but nodemailer is not installed. Run `npm install nodemailer` or configure RESEND_API_KEY instead.');
      }
      throw new Error(`SMTP delivery failed: ${err.message}`);
    }
  }

  // 4. Safe Development Mode (when running locally without configured secrets)
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    console.log('\n=================== [DEV MODE EMAIL TRANSMISSION] ===================');
    console.log(`To: ${recipient}`);
    console.log(`Reply-To: ${replyTo || 'None'}`);
    console.log(`Subject: ${subject}`);
    console.log('--- Content ---');
    console.log(text);
    console.log('====================================================================\n');
    return {
      success: true,
      provider: 'dev_mock',
      message: 'Email simulated in development mode. Set RESEND_API_KEY or SMTP credentials in .env for production.'
    };
  }

  throw new Error('No email provider credentials configured on server. Please set RESEND_API_KEY, SENDGRID_API_KEY, or SMTP credentials in environment variables.');
}

module.exports = { sendEmail };
