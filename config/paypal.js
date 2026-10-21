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

/**
 * Verifica la firma de un webhook de PayPal contra su API oficial.
 * Requiere PAYPAL_WEBHOOK_ID en .env (se obtiene al crear el webhook
 * en el panel de desarrolladores de PayPal).
 *
 * Devuelve { configured, valid, motivo }.
 * - `configured: false` → no hay PAYPAL_WEBHOOK_ID; el llamador decide
 *   si confía en la verificación indirecta (reconsultar la orden).
 */
const verifyWebhookSignature = async (headers = {}, evento = {}) => {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    return { configured: false, valid: false, motivo: 'PAYPAL_WEBHOOK_ID no configurado' };
  }

  if (!isConfigured()) {
    return { configured: true, valid: false, motivo: 'Credenciales de PayPal no configuradas' };
  }

  const respuesta = await pedir('POST', '/v1/notifications/verify-webhook-signature', {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    transmission_sig: headers['paypal-transmission-sig'],
    transmission_time: headers['paypal-transmission-time'],
    webhook_id: webhookId,
    webhook_event: evento,
  });

  const estado = respuesta.datos && respuesta.datos.verification_status;
  return {
    configured: true,
    valid: Boolean(respuesta.ok && estado === 'SUCCESS'),
    motivo: estado || `HTTP ${respuesta.status}`,
  };
};

module.exports = {
  isConfigured,
  createOrder,
  getOrder,
  captureOrder,
  verifyWebhookSignature,
};
