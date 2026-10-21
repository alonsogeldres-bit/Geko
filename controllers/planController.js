const PlanModel = require('../models/planModel');
const paypal = require('../config/paypal');

/* Aviso único si falta PAYPAL_WEBHOOK_ID (no spamear el log). */
let avisoWebhookSinFirmaMostrado = false;

/* Checkouts en curso por cliente: evita órdenes duplicadas en el mismo proceso. */
const checkoutsEnCurso = new Set();

/* GET /planes — muestra el catálogo, el plan actual y el checkout pendiente. */
const showPlanes = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    const idCliente = await PlanModel.getClienteByUser(idUsuario);

    const planes = await PlanModel.listPlans();
    let suscripcion = idCliente ? await PlanModel.getActiveSubscription(idCliente) : null;
    let pendiente = idCliente ? await PlanModel.getLatestPending(idCliente) : null;

    // Reconciliación al entrar: si el retorno del navegador o el webhook
    // fallaron, se reconsulta la orden y se activa si ya está pagada.
    if (idCliente && pendiente && pendiente.paypalOrderId) {
      await reconciliarPendiente(pendiente.paypalOrderId);
      suscripcion = await PlanModel.getActiveSubscription(idCliente);
      pendiente = await PlanModel.getLatestPending(idCliente);
    }

    res.render('post/planes', {
      usuario: req.session.usuario,
      planes,
      suscripcion,
      pendiente,
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
 * Activa la suscripción a partir de una orden de PayPal ya confirmada.
 *
 * Valida que:
 *  - el `custom_id` corresponda a una suscripción real,
 *  - la orden sea la misma que se guardó al iniciar el checkout,
 *  - el monto y la moneda coincidan con lo registrado en `pago`.
 *
 * Devuelve 'aprobado' | 'invalida'.
 */
const activarDesdeOrden = async (orden) => {
  const unidad = (orden.purchase_units && orden.purchase_units[0]) || {};
  const captura = unidad.payments && unidad.payments.captures && unidad.payments.captures[0];
  const customId = unidad.custom_id || (captura && captura.custom_id);
  const idSuscripcion = Number(customId);

  let pago = null;

  if (Number.isInteger(idSuscripcion) && idSuscripcion > 0) {
    pago = await PlanModel.getPaymentBySubscription(idSuscripcion);
  }

  // Respaldo: la respuesta de captureOrder no siempre repite custom_id,
  // pero la orden ya quedó guardada en pago.paypal_order_id.
  if (!pago && orden.id) {
    pago = await PlanModel.getByPaypalOrderId(orden.id);
  }

  if (!pago) {
    console.error('[planes] no se pudo asociar la orden a un pago:', orden.id);
    return 'invalida';
  }

  if (pago.paypal_order_id && pago.paypal_order_id !== orden.id) {
    console.error(
      '[planes] la orden no coincide con el pago registrado:',
      orden.id,
      pago.paypal_order_id
    );
    return 'invalida';
  }

  const monto = Number(unidad.amount && unidad.amount.value);
  const moneda = unidad.amount && unidad.amount.currency_code;

  if (
    !Number.isFinite(monto) ||
    Math.abs(monto - Number(pago.monto)) > 0.01 ||
    moneda !== pago.moneda
  ) {
    console.error(
      '[planes] monto/moneda no coinciden con el pago',
      pago.id_suscripcion,
      { esperado: `${pago.monto} ${pago.moneda}`, recibido: `${monto} ${moneda}` }
    );
    return 'invalida';
  }

  // Reintento de webhook o de retorno: ya estaba pagada, no se toca nada.
  if (pago.estado === 'Pagado') return 'aprobado';

  const activada = await PlanModel.activateSubscription(pago.id_suscripcion);
  return activada ? 'aprobado' : 'invalida';
};

/**
 * Verifica la orden contra la API de PayPal (nunca se confía en los
 * parámetros del navegador ni en el cuerpo del webhook).
 *
 * - APPROVED + `intentarCapturar` → captura y activa.
 * - COMPLETED → solo activa (idempotente).
 * - VOIDED / CANCELLED → marca el pago como rechazado.
 * Devuelve 'aprobado' | 'pendiente' | 'rechazado' | 'cancelado' |
 *          'invalida' | 'error'.
 */
const verificarYActivar = async (orderId, intentarCapturar) => {
  const consulta = await paypal.getOrder(orderId);
  if (!consulta.ok || !consulta.datos) {
    console.error(`[planes] no se pudo consultar la orden ${orderId} (HTTP ${consulta.status})`);
    return 'error';
  }

  const orden = consulta.datos;

  if (orden.status === 'COMPLETED') {
    return activarDesdeOrden(orden);
  }

  if (orden.status === 'APPROVED') {
    if (!intentarCapturar) return 'pendiente';

    const captura = await paypal.captureOrder(orderId);
    if (captura.ok && captura.datos && captura.datos.status === 'COMPLETED') {
      return activarDesdeOrden(captura.datos);
    }

    // Puede fallar porque otra pestaña o el webhook ya la capturó.
    const reclamada = await paypal.getOrder(orderId);
    if (reclamada.ok && reclamada.datos && reclamada.datos.status === 'COMPLETED') {
      return activarDesdeOrden(reclamada.datos);
    }

    const detalle = captura.datos && captura.datos.details && captura.datos.details[0];
    const issue = detalle && detalle.issue;

    if (issue === 'INSTRUMENT_DECLINED' || issue === 'PAYER_CANNOT_PAY') {
      await PlanModel.markPaymentFailed(orderId);
      return 'rechazado';
    }

    return 'pendiente';
  }

  if (orden.status === 'VOIDED' || orden.status === 'CANCELLED') {
    await PlanModel.markPaymentFailed(orderId);
    return 'cancelado';
  }

  return 'pendiente';
};

/**
 * Revisa una orden pendiente contra PayPal y la activa si ya está pagada.
 * No captura: solo confirma el estado real (seguro ante reintentos).
 */
const reconciliarPendiente = async (orderId) => {
  try {
    const estado = await verificarYActivar(orderId, false);

    if (estado === 'aprobado') {
      console.log(`[planes] pago ${orderId} reconciliado y activado.`);
    }

    return estado;
  } catch (err) {
    console.error('[planes] no se pudo reconciliar el pago pendiente:', err.message);
    return 'error';
  }
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
    if (!plan || !plan.precioUsd || plan.precioUsd <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Este plan no está disponible para pago con PayPal.',
      });
    }

    if (!paypal.isConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          'Los pagos no están disponibles: faltan PAYPAL_CLIENT_ID y PAYPAL_CLIENT_SECRET en el servidor.',
      });
    }

    if (checkoutsEnCurso.has(idCliente)) {
      return res.status(409).json({
        success: false,
        message:
          'Ya hay un checkout en curso para tu cuenta. Espera unos segundos y vuelve a intentarlo.',
      });
    }

    checkoutsEnCurso.add(idCliente);

    try {
      let pendiente;
      try {
        pendiente = await PlanModel.createPendingCheckout(
          idCliente,
          plan.id,
          plan.precioUsd,
          'USD'
        );
      } catch (err) {
        if (err.code === 'CHECKOUT_EN_PROCESO') {
          return res.status(409).json({
            success: false,
            message:
              'Ya tienes un pago en proceso. Termínalo en PayPal o espera 15 minutos antes de intentarlo de nuevo.',
          });
        }
        throw err;
      }

      // BASE_URL puede traer '/' final: se normaliza para no duplicar slash.
      const baseUrl = (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');

      const creacion = await paypal.createOrder({
        intent: 'CAPTURE',
        purchase_units: [
          {
            amount: { currency_code: 'USD', value: plan.precioUsd.toFixed(2) },
            description: `Plan ${plan.nombre} - GEKO`,
            custom_id: String(pendiente.id),
          },
        ],
        application_context: {
          brand_name: 'GEKO',
          user_action: 'PAY_NOW',
          return_url: `${baseUrl}/planes/retorno`,
          cancel_url: `${baseUrl}/planes/retorno?cancel=1`,
        },
      });

      if (!creacion.ok || !creacion.datos || !creacion.datos.id) {
        await PlanModel.cancelPendingCheckout(pendiente.id);
        throw new Error(`PayPal createOrder respondió ${creacion.status}`);
      }

      const linkAprobar = (creacion.datos.links || []).find((l) => l.rel === 'approve');
      if (!linkAprobar) {
        await PlanModel.cancelPendingCheckout(pendiente.id);
        throw new Error('PayPal no devolvió el enlace de aprobación.');
      }

      const asociada = await PlanModel.attachPaypalOrder(pendiente.id, creacion.datos.id);
      if (!asociada) {
        return res.status(409).json({
          success: false,
          message: 'Otro checkout se completó al mismo tiempo. Vuelve a intentarlo.',
        });
      }

      return res.json({ success: true, payUrl: linkAprobar.href });
    } finally {
      checkoutsEnCurso.delete(idCliente);
    }
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
    const normalizado = estado === 'invalida' ? 'error' : estado;
    return res.redirect(`/planes?pago=${normalizado}`);
  } catch (err) {
    console.error('[planes] error al verificar el retorno de pago:', err.message);
    return res.redirect('/planes?pago=error');
  }
};

/* POST /webhook/paypal — notificación servidor-a-servidor de PayPal.
   Verifica la firma, deduplica por event_id y reconsulta la orden real. */
const recibirWebhook = async (req, res) => {
  let eventId = null;

  try {
    const evento = (req.body && req.body.event_type) || null;
    if (!evento) return res.sendStatus(400);

    const firma = await paypal.verifyWebhookSignature(req.headers, req.body);

    if (firma.configured && !firma.valid) {
      console.warn('[webhook] firma inválida:', firma.motivo);
      return res.sendStatus(400);
    }

    if (!firma.configured && !avisoWebhookSinFirmaMostrado) {
      avisoWebhookSinFirmaMostrado = true;
      console.warn(
        '[webhook] PAYPAL_WEBHOOK_ID no configurado: se valida solo reconsultando la orden en PayPal.'
      );
    }

    eventId = req.body.id || null;
    if (eventId) {
      const nuevo = await PlanModel.registrarEventoWebhook(eventId, evento);
      if (!nuevo) {
        console.log(`[webhook] evento duplicado ignorado: ${eventId}`);
        return res.sendStatus(200);
      }
    }

    const recurso = (req.body && req.body.resource) || {};
    const ids = recurso.supplementary_data && recurso.supplementary_data.related_ids;
    const orderId =
      (ids && ids.order_id) ||
      (recurso.resource_type === 'checkout-order' ? recurso.id : null);

    switch (evento) {
      case 'PAYMENT.CAPTURE.COMPLETED': {
        if (!orderId) break;
        const estado = await verificarYActivar(orderId, false);
        console.log(`[webhook] orden ${orderId} verificada: ${estado}`);
        if (estado === 'error') {
          throw new Error(`No se pudo verificar la orden ${orderId}.`);
        }
        break;
      }

      case 'PAYMENT.CAPTURE.DENIED': {
        if (orderId) await PlanModel.markPaymentFailed(orderId);
        break;
      }

      case 'PAYMENT.CAPTURE.REFUNDED': {
        if (orderId) await PlanModel.markRefunded(orderId);
        break;
      }

      default:
        break;
    }

    return res.sendStatus(200);
  } catch (err) {
    console.error('[webhook] error al procesar la notificación de PayPal:', err.message);
    // Se borra el evento para que PayPal reintente y no quede marcado como visto.
    if (eventId) {
      await PlanModel.eliminarEventoWebhook(eventId).catch(() => {});
    }
    return res.sendStatus(500);
  }
};

module.exports = { showPlanes, chooseFree, startCheckout, retornoPago, recibirWebhook };
