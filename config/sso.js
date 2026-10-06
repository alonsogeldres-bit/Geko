const crypto = require('crypto');
require('dotenv').config();

/* ===========================================
   CONFIG - Social login (OAuth 2.0)
   Configuration and URLs only. No SQL, no business logic.
   =========================================== */

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const GOOGLE_SCOPE = 'openid email profile';

// Apple requires a paid membership (Apple Developer Program, 99 USD/year),
// so it can be turned off without deleting the code already written.
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

/** Apple requires a paid membership. Returns null when it is ready. */
const appleNotice = () => {
  if (isAppleConfigured()) return null;
  if (!APPLE_ENABLED) {
    return 'Apple ID está desactivado. Requiere membresía de Apple Developer Program (99 USD/año).';
  }
  return 'Apple ID está habilitado pero le faltan credenciales en .env.';
};

/** Which provider buttons should be rendered in the login view. */
const enabledProviders = () => ({
  google: isGoogleConfigured(),
  apple: isAppleConfigured(),
});

// ---------- CSRF state ----------

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

// ---------- Code-for-token exchange ----------

const exchangeCodeForTokens = async (code) => {
  const response = await fetch(GOOGLE_TOKEN_URL, {
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

  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || 'no detail';
    throw new Error(`Google token error: ${detail}`);
  }

  return payload;
};

// ---------- User profile ----------

const fetchGoogleProfile = async (accessToken) => {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Google userinfo error: ${response.status}`);
  }

  const profile = await response.json();

  // NOTE: correo, nombre, apellido and foto are COLUMN names in the
  // `usuarios` table, so the returned keys stay in Spanish to match.
  return {
    idProveedor: profile.sub || '',
    correo: (profile.email || '').trim().toLowerCase(),
    correoVerificado: profile.email_verified === true || profile.email_verified === 'true',
    nombre: (profile.given_name || '').trim(),
    apellido: (profile.family_name || '').trim(),
    foto: profile.picture || null,
  };
};

module.exports = {
  google,
  apple,
  APPLE_ENABLED,
  isGoogleConfigured,
  isAppleConfigured,
  appleNotice,
  enabledProviders,
  createState,
  isValidState,
  googleAuthorizationUrl,
  exchangeCodeForTokens,
  fetchGoogleProfile,
};