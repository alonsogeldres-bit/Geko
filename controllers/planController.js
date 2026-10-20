const PlanModel = require('../models/planModel');

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

module.exports = { showPlanes, chooseFree };
