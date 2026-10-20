/* ===========================================
   MIDDLEWARE DE PLANES
   Resuelve el plan efectivo del usuario y protege funciones de pago.
   Reservado para CA3 de HU-013: hoy no hay funciones exclusivas de pago,
   así que requirePaidPlan no se aplica a ninguna ruta todavía.
   =========================================== */

const PlanModel = require('../models/planModel');

/**
 * Plan efectivo del usuario en sesión: suscripción activa o Gratis por defecto.
 * Deja el resultado en req.plan. Devuelve null si no hay sesión o perfil.
 */
const withEffectivePlan = async (req, res, next) => {
  const idUsuario = req.session && req.session.usuario && req.session.usuario.id_usuario;
  if (!idUsuario) return next();

  try {
    const idCliente = await PlanModel.getClienteByUser(idUsuario);
    req.plan = idCliente ? await PlanModel.getEffectivePlan(idCliente) : null;
  } catch (err) {
    console.error('[plan] error al resolver el plan efectivo:', err.message);
    req.plan = null;
  }

  next();
};

/**
 * Bloquea el acceso a una función exclusiva de pago.
 * Uso futuro:  router.get('/algo-premium', requirePaidPlan('rutinas_ia'), handler)
 *
 * - Páginas: redirige a /planes.
 * - APIs (Accept: application/json): responde 402 con mensaje y oferta de mejora.
 */
const requirePaidPlan = (feature) => async (req, res, next) => {
  const idUsuario = req.session && req.session.usuario && req.session.usuario.id_usuario;
  if (!idUsuario) return res.redirect('/login');

  try {
    const idCliente = await PlanModel.getClienteByUser(idUsuario);
    const plan = idCliente ? await PlanModel.getEffectivePlan(idCliente) : { esDePago: false };

    if (plan.esDePago) return next();

    const message = 'Esta función no está disponible en tu plan actual. Mejora a un plan superior para usarla.';
    if (req.accepts(['html', 'json']) === 'json') {
      return res.status(402).json({ success: false, feature, message, upgrade: '/planes' });
    }
    return res.redirect('/planes?upgrade=1');
  } catch (err) {
    console.error('[plan] error al verificar la función de pago:', err.message);
    return res.status(500).send('No pudimos verificar tu plan. Inténtalo de nuevo.');
  }
};

module.exports = { withEffectivePlan, requirePaidPlan };
