const nodemailer = require('nodemailer');
require('dotenv').config();

/* ===========================================
   CONFIG - Outgoing email (Gmail SMTP)
   =========================================== */

const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465; // <--- Cambiado de 587 a 465

const MAIL_ENABLED = (process.env.MAIL_ENABLED || 'false').toLowerCase() === 'true';

const mail = {
  user: process.env.MAIL_USER || '',
  appPassword: (process.env.MAIL_APP_PASSWORD || '').trim(),
  fromName: process.env.MAIL_FROM_NAME || 'GEKO',
};

const isMailConfigured = () => MAIL_ENABLED && Boolean(mail.user && mail.appPassword);

const sender = () => `"${mail.fromName}" <${mail.user}>`;

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
    secure: true, // <--- Cambiado a true para el puerto 465 (SSL)
    family: 4,   // <--- Mantiene la preferencia IPv4 en Render
    auth: {
      user: mail.user,
      pass: mail.appPassword,
    },
  });

  return transporter;
};

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