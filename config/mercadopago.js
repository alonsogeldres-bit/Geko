/* ===========================================
   CONFIGURACIÓN DE MERCADO PAGO
   Cliente del SDK + helpers para crear la
   preferencia de checkout y consultar pagos.
   Requiere MP_ACCESS_TOKEN en .env.
   =========================================== */

const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

// Se lee en el momento de usarlo (no al cargar el módulo) para que
// siempre esté disponible después de dotenv.config() en app.js.
const isConfigured = () => Boolean(process.env.MP_ACCESS_TOKEN);

const getClient = () => {
  if (!isConfigured()) {
    throw new Error('MP_ACCESS_TOKEN no está configurado en .env.');
  }
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
};

/**
 * Crea la preferencia de pago (Checkout Pro) y devuelve
 * el objeto con init_point (URL de pago de Mercado Pago).
 */
const createCheckoutPreference = async (datos) => {
  const preference = new Preference(getClient());
  return preference.create({ body: datos });
};

/**
 * Consulta un pago real en la API de Mercado Pago.
 * Nunca confiar en el contenido de los webhooks sin verificar aquí.
 */
const getPayment = async (idPago) => {
  const payment = new Payment(getClient());
  return payment.get({ id: String(idPago) });
};

module.exports = { isConfigured, createCheckoutPreference, getPayment };
