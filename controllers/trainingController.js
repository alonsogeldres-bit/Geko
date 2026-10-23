const DashboardModel = require('../models/dashboardModel');
const RoutineModel = require('../models/routineModel');

/**
 * GET /entrenamiento
 * Placeholder: muestra la rutina que el dashboard propone para hoy, pero
 * todavía no se puede ejecutar. El catálogo de ejercicios y el registro de
 * sesiones se definitúan más adelante (la IA generará las rutinas).
 */
const index = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;

    const perfil = await DashboardModel.getPerfil(idUsuario);
    if (!perfil) return res.redirect('/profile');

    const alt = Math.max(0, parseInt(req.query.alt, 10) || 0);
    const sugerencia = RoutineModel.construirSugerencia(perfil, alt);

    return res.render('post/entrenamiento', {
      usuario: req.session.usuario,
      perfil,
      sugerencia,
    });
  } catch (err) {
    console.error('[entrenamiento] error al cargar los datos:', err.message);
    return res.status(500).send('No pudimos cargar el entrenamiento. Inténtalo de nuevo.');
  }
};

module.exports = {
  index
};
