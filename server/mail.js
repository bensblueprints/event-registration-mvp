// Optional SMTP mailer — Eventcraft works fully without it (confirmation
// emails are simply skipped when SMTP is not configured).
const nodemailer = require('nodemailer');

function smtpConfigured(s) {
  return Boolean(s.smtp_host && s.smtp_from);
}

/**
 * Send an email if SMTP is configured. Returns 'skipped' when not configured
 * (soft no-op by design — no external calls unless the owner opted in).
 */
async function sendMail(settings, to, subject, text) {
  if (!smtpConfigured(settings)) return 'skipped';
  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: Number(settings.smtp_port) || 587,
    secure: Number(settings.smtp_port) === 465,
    auth: settings.smtp_user ? { user: settings.smtp_user, pass: settings.smtp_pass } : undefined
  });
  await transporter.sendMail({ from: settings.smtp_from, to, subject, text });
  return 'sent';
}

module.exports = { sendMail, smtpConfigured };
