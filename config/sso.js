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

// Se quitan las barras finales para que BASE_URL=http://localhost:6767/ no genere "//ruta".
const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');

const google = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: process.env.GOOGLE_REDIRECT_URI || `${baseUrl}/auth/google/callback`,
};

const isGoogleConfigured = () => Boolean(google.clientId && google.clientSecret);

/** Which provider buttons should be rendered in the login view. */
const enabledProviders = () => ({
  google: isGoogleConfigured(),
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
  isGoogleConfigured,
  enabledProviders,
  createState,
  isValidState,
  googleAuthorizationUrl,
  exchangeCodeForTokens,
  fetchGoogleProfile,
};