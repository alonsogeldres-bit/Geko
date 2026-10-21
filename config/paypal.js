/* ===========================================
   CONFIGURACIÓN DE PAYPAL (Orders API v2)
   REST directo con fetch nativo de Node (>=18).
   Requiere en .env:
     PAYPAL_CLIENT_ID
     PAYPAL_CLIENT_SECRET
     PAYPAL_MODE = sandbox | live   (opcional, por defecto sandbox)
   =========================================== */

const isConfigured = () =>
  Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

const API_BASE = () =>
  process.env.PAYPAL_MODE === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

/* Token OAuth (client_credentials) cacheado hasta poco antes de expirar. */
let tokenCache = { token: null, expira: 0 };

const getToken = async () => {
  if (!isConfigured()) {
    throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET no están configurados en .env.');
  }
  if (tokenCache.token && Date.now() < tokenCache.expira) {
    return tokenCache.token;
  }

  const credenciales = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');

  const resp = await fetch(`${API_BASE()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credenciales}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!resp.ok) {
    throw new Error(`PayPal OAuth falló (${resp.status}). Revisa las credenciales.`);
  }

  const data = await resp.json();
  tokenCache = {
    token: data.access_token,
    // expires_in viene en segundos; se resta un margen de seguridad.
    expira: Date.now() + (data.expires_in - 60) * 1000,
  };
  return tokenCache.token;
};

/** Petición genérica a la API de PayPal. Devuelve { ok, status, datos }. */
const pedir = async (metodo, ruta, cuerpo) => {
  const token = await getToken();
  const resp = await fetch(`${API_BASE()}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await resp.json().catch(() => null);
  return { ok: resp.ok, status: resp.status, datos };
};

/** Crea la orden de pago y devuelve sus links (approve → URL de PayPal). */
const createOrder = (datosOrden) => pedir('POST', '/v2/checkout/orders', datosOrden);

/** Consulta una orden por id (estado, monto, custom_id, ...). */
const getOrder = (orderId) => pedir('GET', `/v2/checkout/orders/${orderId}`);

/** Captura (cobra) una orden aprobada. */
const captureOrder = (orderId) => pedir('POST', `/v2/checkout/orders/${orderId}/capture`, {});

module.exports = { isConfigured, createOrder, getOrder, captureOrder };
