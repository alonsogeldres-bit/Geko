const nodemailer = require('nodemailer');
require('dotenv').config();

/* ===========================================
   CONFIG - Outgoing email (Gmail SMTP)
   Only the transport and the sender identity.
   No SQL, no business logic.
   =========================================== */

const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 587;

const MAIL_ENABLED = (process.env.MAIL_ENABLED || 'false').toLowerCase() === 'true';

const mail = {
  user: process.env.MAIL_USER || '',
  appPassword: (process.env.MAIL_APP_PASSWORD || '').trim(),
  fromName: process.env.MAIL_FROM_NAME || 'GEKO',
};

const isMailConfigured = () => MAIL_ENABLED && Boolean(mail.user && mail.appPassword);

/** Sender shown on the "From" line, e.g. "GEKO <no-reply@gmail.com>". */
const sender = () => `"${mail.fromName}" <${mail.user}>`;

/** Returns a short human-readable reason when email cannot be sent. */
const mailNotice = () => {
  if (isMailConfigured()) return null;
  if (!MAIL_ENABLED) return 'El envío de correo está desactivado (MAIL_ENABLED=false).';
  return 'Faltan credenciales de correo en .env (MAIL_USER / MAIL_APP_PASSWORD).';
};

let transporter = null;

/** Lazily builds the Gmail SMTP transport. */
const getTransport = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: false,
    requireTLS: true,
    auth: {
      user: mail.user,
      pass: mail.appPassword,
    },
  });

  return transporter;
};

/** Opens a connection to Gmail to prove the credentials work. */
const verifyTransport = async () => {
  if (!isMailConfigured()) {
    return { ok: false, reason: mailNotice() };
  }
  try {
    await getTransport().verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `Gmail rechazó las credenciales: ${error.message}` };
  }
};

/** Sends one email. Throws if the transport fails. */
const sendMail = async ({ to, subject, text, html }) => {
  if (!isMailConfigured()) {
    throw new Error(mailNotice());
  }
  return getTransport().sendMail({
    from: sender(),
    to,
    subject,
    text,
    html,
  });
};

module.exports = {
  MAIL_ENABLED,
  isMailConfigured,
  mailNotice,
  verifyTransport,
  sendMail,
};
