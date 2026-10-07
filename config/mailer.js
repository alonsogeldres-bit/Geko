const nodemailer = require('nodemailer');
require('dotenv').config();


const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 465;

const MAIL_ENABLED = (process.env.MAIL_ENABLED || 'false').toLowerCase() === 'true';

const mail = {
  user: process.env.MAIL_USER || '',
  appPassword: (process.env.MAIL_APP_PASSWORD || '').trim(),
  fromName: process.env.MAIL_FROM_NAME || 'GEKO',
  brevoKey: (process.env.BREVO_API_KEY || '').trim(),
};

const useBrevo = () => Boolean(mail.brevoKey);

const isMailConfigured = () => {
  if (!MAIL_ENABLED || !mail.user) return false;
  return useBrevo() || Boolean(mail.appPassword);
};

const sender = () => `"${mail.fromName}" <${mail.user}>`;

const mailNotice = () => {
  if (isMailConfigured()) return null;
  if (!MAIL_ENABLED) return 'El envío de correo está desactivado (MAIL_ENABLED=false).';
  return 'Faltan credenciales de correo (MAIL_USER y BREVO_API_KEY o MAIL_APP_PASSWORD).';
};

/* ---------- Gmail SMTP (respaldo / local) ---------- */

let transporter = null;

const getTransport = () => {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    family: 4,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    auth: {
      user: mail.user,
      pass: mail.appPassword,
    },
  });

  return transporter;
};

/* ---------- Brevo (HTTPS) ---------- */

const BREVO_URL = 'https://api.brevo.com/v3';

const brevoFetch = async (path, options = {}) => {
  const res = await fetch(`${BREVO_URL}${path}`, {
    ...options,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': mail.brevoKey,
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Brevo respondió ${res.status}: ${detail}`);
  }
  return res.json().catch(() => ({}));
};

/* ---------- API pública (misma que antes) ---------- */

const verifyTransport = async () => {
  if (!isMailConfigured()) {
    return { ok: false, reason: mailNotice() };
  }
  try {
    if (useBrevo()) {
      await brevoFetch('/account');
    } else {
      await getTransport().verify();
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: `El servicio de correo rechazó la conexión: ${error.message}` };
  }
};

const sendMail = async ({ to, subject, text, html }) => {
  if (!isMailConfigured()) {
    throw new Error(mailNotice());
  }

  if (useBrevo()) {
    return brevoFetch('/smtp/email', {
      method: 'POST',
      body: JSON.stringify({
        sender: { name: mail.fromName, email: mail.user },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });
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