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

// Apple requiere membresía de pago (Apple Developer Program, 99 USD/año).
// Por eso se puede desactivar sin borrar el código ya escrito.
const APPLE_ENABLED = (process.env.APPLE_ENABLED || 'false').toLowerCase() === 'true';
const APPLE_AUTH_URL = 'https://appleid.apple.com/auth/authorize';
const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';

const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

const google = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/auth/google/callback`,
};

const apple = {
  clientId: process.env.APPLE_CLIENT_ID || '',
  teamId: process.env.APPLE_TEAM_ID || '',
  keyId: process.env.APPLE_KEY_ID || '',
  privateKey: (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  redirectUri: process.env.APPLE_REDIRECT_URI || `${baseUrl}/auth/apple/callback`,
};

const isGoogleConfigured = () => Boolean(google.clientId && google.clientSecret);

const isAppleConfigured = () =>
  APPLE_ENABLED &&
  Boolean(apple.clientId && apple.teamId && apple.keyId && apple.privateKey);

/** Apple exige membresía de pago (99 USD/año). Esta función avisa al usuario. */
const appleAviso = () => {
  if (isAppleConfigured()) return null;
  if (!APPLE_ENABLED) {
    return 'Apple ID está desactivado. Requiere membresía de Apple Developer Program (99 USD/año).';
  }
  return 'Apple ID está habilitado pero le faltan credenciales en .env.';
};

/** Qué botones de proveedor se deben mostrar en la vista de login. */
const proveedoresHabilitados = () => ({
  google: isGoogleConfigured(),
  apple: isAppleConfigured(),
});

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
  apple,
  APPLE_ENABLED,
  isGoogleConfigured,
  isAppleConfigured,
  appleAviso,
  proveedoresHabilitados,
  createState,
  isValidState,
  googleAuthorizationUrl,
  exchangeCodeForTokens,
  fetchGoogleProfile,
};