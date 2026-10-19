const DashboardModel = require('../models/dashboardModel');
const RoutineModel = require('../models/routineModel');

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

    // ?alt=N rota la variante de la sugerencia ("Cambiar sugerencia").
    const alt = Math.max(0, parseInt(req.query.alt, 10) || 0);

    const sesiones = await DashboardModel.getSesiones(perfil.idCliente);
    const sugerencia = RoutineModel.construirSugerencia(perfil, alt);
    const resumen = RoutineModel.calcularResumen(sesiones, perfil.diasSemana);
    const actividad = RoutineModel.construirActividad(sesiones);

    return res.render('post/dashboard', {
      usuario: req.session.usuario,
      perfil,
      sugerencia,
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

module.exports = {
  index
};
