const PlanModel = require('../models/planModel');
const paypal = require('../config/paypal');

/* GET /planes — muestra el catálogo y el plan actual (si tiene uno). */
const showPlanes = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    const idCliente = await PlanModel.getClienteByUser(idUsuario);

    const planes = await PlanModel.listPlans();
    const suscripcion = idCliente ? await PlanModel.getActiveSubscription(idCliente) : null;

    res.render('post/planes', {
      usuario: req.session.usuario,
      planes,
      suscripcion,
    });
  } catch (err) {
    console.error('[planes] error al cargar los planes:', err.message);
    res.status(500).send('No pudimos cargar los planes. Inténtalo de nuevo.');
  }
};

/* POST /planes/gratis — activa el plan gratuito y manda al dashboard. */
const chooseFree = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    const idCliente = await PlanModel.getClienteByUser(idUsuario);

    // Sin perfil no hay a qué asociar la suscripción: primero completa el wizard.
    if (!idCliente) {
      return res.status(409).json({
        success: false,
        message: 'Completa tu perfil antes de elegir un plan.',
        redirect: '/profile',
      });
    }

    await PlanModel.activateFree(idCliente);
    return res.json({
      success: true,
      message: 'Plan Gratis activado.',
      redirect: '/dashboard',
    });
  } catch (err) {
    console.error('[planes] error al activar el plan Gratis:', err.message);
    return res.status(500).json({
      success: false,
      message: 'No pudimos activar tu plan. Inténtalo de nuevo.',
    });
  }
};

/** Activa la suscripción a partir del custom_id traído por la orden de PayPal. */
const activarDesdeOrden = async (orden) => {
  const unidad = (orden.purchase_units && orden.purchase_units[0]) || {};
  const idSuscripcion = Number(unidad.custom_id);

  if (!Number.isInteger(idSuscripcion) || idSuscripcion <= 0) return;

  const suscripcion = await PlanModel.getSubscriptionById(idSuscripcion);
  if (suscripcion) {
    await PlanModel.activateSubscription(idSuscripcion, suscripcion.id_cliente);
  }
};

/**
 * Verifica la orden contra la API de PayPal (nunca se confía en los
 * parámetros del navegador ni en el cuerpo del webhook).
 *
 * - Si la orden está APPROVED y `intentarCapturar` es true, la captura
 *   (cobra) y activa la suscripción.
 * - Si ya está COMPLETED, solo activa.
 * Devuelve el estado normalizado para la URL (?pago=...).
 */
const verificarYActivar = async (orderId, intentarCapturar) => {
  const consulta = await paypal.getOrder(orderId);
  if (!consulta.ok || !consulta.datos) return 'pendiente';

  const orden = consulta.datos;

  if (orden.status === 'APPROVED' && intentarCapturar) {
    const captura = await paypal.captureOrder(orderId);
    if (captura.ok && captura.datos && captura.datos.status === 'COMPLETED') {
      await activarDesdeOrden(captura.datos);
      return 'aprobado';
    }
    // Puede fallar si ya fue capturada (otra pestaña, webhook): se reconsulta.
    const reclamada = await paypal.getOrder(orderId);
    if (reclamada.ok && reclamada.datos && reclamada.datos.status === 'COMPLETED') {
      await activarDesdeOrden(reclamada.datos);
      return 'aprobado';
    }
    return 'pendiente';
  }

  if (orden.status === 'COMPLETED') {
    await activarDesdeOrden(orden);
    return 'aprobado';
  }

  if (orden.status === 'VOIDED' || orden.status === 'CANCELLED') return 'cancelado';

  return 'pendiente';
};

/* POST /planes/premium — crea la suscripción pendiente y la orden de
   pago de PayPal (Checkout Orders API v2). Devuelve payUrl. */
const startCheckout = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    const idPlan = Number(req.body.idPlan);

    if (!Number.isInteger(idPlan) || idPlan <= 0) {
      return res.status(400).json({ success: false, message: 'Plan no válido.' });
    }

    const idCliente = await PlanModel.getClienteByUser(idUsuario);
    if (!idCliente) {
      return res.status(409).json({
        success: false,
        message: 'Completa tu perfil antes de contratar un plan.',
        redirect: '/profile',
      });
    }

    const activa = await PlanModel.getActiveSubscription(idCliente);
    if (activa && activa.valor > 0) {
      return res.status(409).json({
        success: false,
        message: 'Ya tienes una suscripción activa.',
        redirect: '/planes',
      });
    }

    const plan = await PlanModel.getPlanById(idPlan);
    if (!plan || plan.valor <= 0) {
      return res.status(400).json({ success: false, message: 'Plan no válido.' });
    }

    if (!paypal.isConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          'Los pagos no están disponibles: faltan PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en el servidor.',
      });
    }

    const suscripcion = await PlanModel.createPendingSubscription(idCliente, plan.id, plan.valor);

    // BASE_URL puede traer '/' final: se normaliza para no duplicar slash en las URLs.
    const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');

    // PayPal no soporta CLP: el monto se cobra en USD (configurable).
    const montoUsd = (Number(process.env.PLAN_PREMIUM_USD) || 9.99).toFixed(2);

    const creacion = await paypal.createOrder({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: 'USD', value: montoUsd },
          description: `Plan ${plan.nombre} - GEKO`,
          custom_id: String(suscripcion.id),
        },
      ],
      application_context: {
        brand_name: 'GEKO',
        user_action: 'PAY_NOW',
        return_url: `${baseUrl}/planes/retorno`,
        cancel_url: `${baseUrl}/planes/retorno?cancel=1`,
      },
    });

    if (!creacion.ok || !creacion.datos) {
      throw new Error(`PayPal createOrder respondió ${creacion.status}`);
    }

    const linkAprobar = (creacion.datos.links || []).find((l) => l.rel === 'approve');
    if (!linkAprobar) {
      throw new Error('PayPal no devolvió el enlace de aprobación.');
    }

    return res.json({ success: true, payUrl: linkAprobar.href });
  } catch (err) {
    console.error('[planes] error al iniciar el checkout Premium:', err.message);
    return res.status(500).json({
      success: false,
      message: 'No pudimos iniciar el pago. Inténtalo de nuevo.',
    });
  }
};

/* GET /planes/retorno — el usuario vuelve desde PayPal.
   Verifica/captura la orden real y redirige a /planes con el resultado. */
const retornoPago = async (req, res) => {
  try {
    if (req.query.cancel === '1') {
      return res.redirect('/planes?pago=cancelado');
    }

    const orderId = req.query.token; // PayPal agrega ?token=ID_DE_ORDEN al volver
    if (!orderId) {
      return res.redirect('/planes?pago=cancelado');
    }

    const estado = await verificarYActivar(orderId, true);
    return res.redirect(`/planes?pago=${estado}`);
  } catch (err) {
    console.error('[planes] error al verificar el retorno de pago:', err.message);
    return res.redirect('/planes?pago=error');
  }
};

/* POST /webhook/paypal — notificación de PayPal (evento de captura).
   Siempre responde 200; la verificación real es contra la API. */
const recibirWebhook = async (req, res) => {
  try {
    const evento = req.body && req.body.event_type;
    const recurso = (req.body && req.body.resource) || {};

    if (evento === 'PAYMENT.CAPTURE.COMPLETED') {
      const ids = recurso.supplementary_data && recurso.supplementary_data.related_ids;
      const orderId = ids && ids.order_id;

      if (orderId) {
        // No capturar de nuevo: el pago ya se hizo; solo verificar y activar.
        const estado = await verificarYActivar(orderId, false);
        console.log(`[webhook] orden ${orderId} verificada: ${estado}`);
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook] error al procesar la notificación de PayPal:', err.message);
    // Responder 200 evita reintentos en bucle; el retorno del navegador
    // (/planes/retorno) vuelve a verificar el estado real del pago.
    res.sendStatus(200);
  }
};

module.exports = { showPlanes, chooseFree, startCheckout, retornoPago, recibirWebhook };
