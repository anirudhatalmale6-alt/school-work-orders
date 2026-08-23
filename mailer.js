// Email notifications are optional. With no SMTP_HOST configured the app runs
// exactly as before and every send is a silent no-op, so a broken mail server can
// never stop a ticket from being submitted.
const nodemailer = require('nodemailer');

const enabled = !!process.env.SMTP_HOST;

const transport = enabled
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || '') === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined
    })
  : null;

async function send({ to, subject, text }) {
  if (!enabled || !to) return;
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to,
      subject,
      text
    });
  } catch (err) {
    // Never let a mail failure surface to the person submitting a ticket.
    console.error('[mail] send failed:', err.message);
  }
}

module.exports = { send, enabled };
