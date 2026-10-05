const crypto = require('crypto');
require('dotenv').config();

/* ===========================================
   CONFIG - Autenticacion social (OAuth 2.0)
   Solo configuracion y URLs. Sin SQL, sin negocio.
   =========================================== */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_SCOPE = 'openid email profile';

const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const google = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/auth/google/callback`,
};

const isGoogleConfigured = () => Boolean(google.clientId && google.clientSecret);

// ---------- Estado anti-CSRF ----------

const createState = () => crypto.randomBytes(24).toString('hex');

const isValidState = (received, expected) =>
  Boolean(received && expected) && received === expected;

// ---------- URLs ----------

const googleAuthorizationUrl = (state) => {
  const params = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: google.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'select_account',
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
};

// ---------- Canje de codigo por token ----------

const exchangeCodeForTokens = async (code) => {
  const respuesta = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: google.clientId,
      client_secret: google.clientSecret,
      redirect_uri: google.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const datos = await respuesta.json();

  if (!respuesta.ok || !datos.access_token) {
    const detalle = datos.error_description || datos.error || 'sin detalle';
    throw new Error(`Google token error: ${detalle}`);
  }

  return datos;
};

// ---------- Perfil del usuario ----------

const fetchGoogleProfile = async (accessToken) => {
  const respuesta = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!respuesta.ok) {
    throw new Error(`Google userinfo error: ${respuesta.status}`);
  }

  const perfil = await respuesta.json();

  return {
    idProveedor: perfil.sub || '',
    correo: (perfil.email || '').trim().toLowerCase(),
    correoVerificado: perfil.email_verified === true || perfil.email_verified === 'true',
    nombre: (perfil.given_name || '').trim(),
    apellido: (perfil.family_name || '').trim(),
    foto: perfil.picture || null,
  };
};

module.exports = {
  google,
  isGoogleConfigured,
  createState,
  isValidState,
  googleAuthorizationUrl,
  exchangeCodeForTokens,
  fetchGoogleProfile,
};