const DashboardModel = require('../models/dashboardModel');
const RoutineModel = require('../models/routineModel');
const PlanModel = require('../models/planModel');

/** true si el cliente tiene un plan de pago activo (Premium): cambios ilimitados. */
const tienePlanDePago = async (idCliente) => {
  try {
    if (!idCliente) return false;
    const plan = await PlanModel.getEffectivePlan(idCliente);
    return Boolean(plan && plan.esDePago);
  } catch (err) {
    console.error('[dashboard] no se pudo resolver el plan:', err.message);
    return false; // ante la duda, se aplica el límite del plan Gratis
  }
};

/**
 * GET /dashboard
 * Muestra la sugerencia del día, el resumen de la semana y la actividad
 * reciente, todo construido con los datos reales que dejó el wizard de
 * /profile. Si el usuario todavía no completó el perfil, se lo manda a
 * completarlo en vez de mostrarle datos de ejemplo.
 */
const index = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;

    const perfil = await DashboardModel.getPerfil(idUsuario);
    if (!perfil) return res.redirect('/profile');

    // Modo prueba: al cargar o recargar la página siempre se empieza en 1/3.
    const alt = 0;

    const sesiones = await DashboardModel.getSesiones(perfil.idCliente);
    const esPremium = await tienePlanDePago(perfil.idCliente);
    const sugerencia = RoutineModel.construirSugerencia(perfil, alt, esPremium);
    const resumen = RoutineModel.calcularResumen(sesiones, perfil.dias, perfil.diasSemana);
    const actividad = RoutineModel.construirActividad(sesiones);

    return res.render('post/dashboard', {
      usuario: req.session.usuario,
      perfil,
      sugerencia,
      esPremium,
      resumen,
      actividad,
      // Rutina a medias. Sigue en null mientras no exista el registro de
      // sesiones; el modelo ya devuelve el historial cuando exista.
      enProgreso: null,
    });
  } catch (err) {
    console.error('[dashboard] error al cargar los datos:', err.message);
    return res.status(500).send('No pudimos cargar tu dashboard. Inténtalo de nuevo.');
  }
};

/**
 * POST /dashboard/sugerencia   (body JSON: { alt: N })
 * Devuelve la sugerencia número N en JSON. El tope es la cantidad de variantes
 * (3): si piden una mayor, devuelve la última. No guarda nada: al recargar la
 * página se vuelve a 1/3 (modo prueba).
 */
const sugerencia = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;

    const perfil = await DashboardModel.getPerfil(idUsuario);
    if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' });

    const alt = Math.max(0, parseInt(req.body && req.body.alt, 10) || 0);
    const esPremium = await tienePlanDePago(perfil.idCliente);
    return res.json(RoutineModel.construirSugerencia(perfil, alt, esPremium));
  } catch (err) {
    console.error('[dashboard] error al cambiar la sugerencia:', err.message);
    return res.status(500).json({ error: 'No pudimos cambiar la sugerencia.' });
  }
};

module.exports = {
  index,
  sugerencia
};