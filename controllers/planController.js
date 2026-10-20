const PlanModel = require('../models/planModel');
const mp = require('../config/mercadopago');

/* Estados de pago de Mercado Pago → mensajes de retorno. */
const ESTADO_PAGO = {
  approved: 'aprobado',
  rejected: 'rechazado',
  cancelled: 'cancelado',
  pending: 'pendiente',
  in_process: 'pendiente',
  authorized: 'pendiente',
  refunded: 'reembolsado',
};

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

/**
 * Verifica el pago contra la API de Mercado Pago y, si está aprobado,
 * activa la suscripción. Devuelve el estado normalizado ('aprobado',
 * 'rechazado', 'pendiente', ...).
 */
const verificarYActivar = async (idPagoMp) => {
  const pago = await mp.getPayment(idPagoMp);
  if (!pago || !pago.external_reference) return 'pendiente';

  const idSuscripcion = Number(pago.external_reference);
  if (!Number.isInteger(idSuscripcion) || idSuscripcion <= 0) return 'pendiente';

  if (pago.status === 'approved') {
    const suscripcion = await PlanModel.getSubscriptionById(idSuscripcion);
    if (suscripcion) {
      await PlanModel.activateSubscription(idSuscripcion, suscripcion.id_cliente);
    }
    return 'aprobado';
  }

  return ESTADO_PAGO[pago.status] || 'pendiente';
};

/* POST /planes/premium — crea la suscripción pendiente y la preferencia
   de pago de Mercado Pago (Checkout Pro). Devuelve init_point. */
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

    if (!mp.isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Los pagos no están disponibles: falta configurar MP_ACCESS_TOKEN en el servidor.',
      });
    }

    const suscripcion = await PlanModel.createPendingSubscription(idCliente, plan.id, plan.valor);

    // BASE_URL puede traer '/' final: se normaliza para no duplicar slash en las URLs.
    const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');
    const creada = await mp.createCheckoutPreference({
      items: [
        {
          id: String(plan.id),
          title: `Plan ${plan.nombre} - GEKO`,
          quantity: 1,
          unit_price: plan.valor,
          currency_id: 'CLP',
        },
      ],
      external_reference: String(suscripcion.id),
      notification_url: `${baseUrl}/webhook/mercadopago`,
      back_urls: {
        success: `${baseUrl}/planes/retorno`,
        failure: `${baseUrl}/planes/retorno`,
        pending: `${baseUrl}/planes/retorno`,
      },
      auto_return: 'approved',
      statement_descriptor: 'GEKO',
      metadata: { id_suscripcion: suscripcion.id },
    });

    return res.json({ success: true, initPoint: creada.init_point });
  } catch (err) {
    console.error('[planes] error al iniciar el checkout Premium:', err.message);
    return res.status(500).json({
      success: false,
      message: 'No pudimos iniciar el pago. Inténtalo de nuevo.',
    });
  }
};

/* GET /planes/retorno — el usuario vuelve desde Mercado Pago.
   Verifica el pago real y redirige a /planes con el resultado. */
const retornoPago = async (req, res) => {
  try {
    const idPagoMp = req.query.payment_id || req.query.collection_id;
    const idSuscripcion = Number(req.query.external_reference);

    if (!idPagoMp) {
      return res.redirect(idSuscripcion ? '/planes?pago=cancelado' : '/planes');
    }

    const estado = await verificarYActivar(idPagoMp);
    return res.redirect(`/planes?pago=${estado}`);
  } catch (err) {
    console.error('[planes] error al verificar el retorno de pago:', err.message);
    return res.redirect('/planes?pago=error');
  }
};

/* POST /webhook/mercadopago — notificación de Mercado Pago.
   Siempre responde 200; la verificación real es contra la API. */
const recibirWebhook = async (req, res) => {
  try {
    const tipo = (req.body && (req.body.type || req.body.topic)) || req.query.topic || req.query.type;
    const idPago = (req.body && req.body.data && req.body.data.id) || req.query.id;

    if (tipo === 'payment' && idPago) {
      const estado = await verificarYActivar(idPago);
      console.log(`[webhook] pago ${idPago} verificado: ${estado}`);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('[webhook] error al procesar la notificación de MP:', err.message);
    // Responder 200 evita reintentos en bucle; el retorno del navegador
    // (/planes/retorno) vuelve a verificar el estado real del pago.
    res.sendStatus(200);
  }
};

module.exports = { showPlanes, chooseFree, startCheckout, retornoPago, recibirWebhook };
