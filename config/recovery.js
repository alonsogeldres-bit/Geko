const crypto = require('crypto');
require('dotenv').config();


const TTL_MINUTES = Number(process.env.RECOVERY_TOKEN_TTL_MINUTES) || 15;

const baseUrl = process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`; 
const secret = () => {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error('SESSION_SECRET no está definido en .env');
  }
  return value;
};

const base64url = (buffer) =>
  Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const fromBase64url = (value) =>
  Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

const sign = (payload) =>
  base64url(crypto.createHmac('sha256', secret()).update(payload).digest());

/** Builds a token for the given user id, valid for TTL_MINUTES. */
const createToken = (idUsuario) => {
  const payload = base64url(
    JSON.stringify({
      uid: Number(idUsuario),
      exp: Date.now() + TTL_MINUTES * 60 * 1000,
      jti: crypto.randomBytes(12).toString('hex'),
    })
  );

  return `${payload}.${sign(payload)}`;
};

/**
 * Verifies a token.
 * Returns { valid: true, idUsuario } or { valid: false, reason }.
 * The signature is compared in constant time.
 */
const verifyToken = (token) => {
  if (typeof token !== 'string' || !token.includes('.')) {
    return { valid: false, reason: 'El enlace no es válido.' };
  }

  const [payload, signature] = token.split('.');

  if (!payload || !signature) {
    return { valid: false, reason: 'El enlace no es válido.' };
  }

  const expected = sign(payload);
  const given = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);

  if (given.length !== expectedBuf.length || !crypto.timingSafeEqual(given, expectedBuf)) {
    return { valid: false, reason: 'El enlace no es válido.' };
  }

  let data;
  try {
    data = JSON.parse(fromBase64url(payload));
  } catch {
    return { valid: false, reason: 'El enlace no es válido.' };
  }

  if (typeof data.exp !== 'number' || data.exp < Date.now()) {
    return { valid: false, reason: 'El enlace expiró. Solicita uno nuevo.' };
  }

  if (typeof data.uid !== 'number' || !Number.isInteger(data.uid) || data.uid <= 0) {
    return { valid: false, reason: 'El enlace no es válido.' };
  }

  return { valid: true, idUsuario: data.uid };
};

/** Absolute URL that goes in the email body. */
const buildResetUrl = (token) => `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

module.exports = {
  TTL_MINUTES,
  createToken,
  verifyToken,
  buildResetUrl,
};
