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

    /* La rutina con IA necesita tiempo por sesión y lugar de entrenamiento. */
    if (!perfil.minutosSesion || !perfil.entorno) {
      return res.redirect('/configuracion');
    }

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

/**
 * POST /entrenamiento/rutina
 * Genera otra rutina y devuelve solo el HTML de la rutina para que el
 * navegador lo sustituya sin recargar la página ni perder el scroll.
 * Solo descuenta una solicitud si la IA respondió (no si se usó el
 * respaldo local), para no gastar intentos cuando Groq está saturado.
 */
const generarOtra = async (req, res) => {
  try {
    const perfil = await DashboardModel.getPerfil(req.session.usuario.id_usuario);
    if (!perfil) {
      return res.status(400).json({
        ok: false,
        error: 'Completa tu perfil para generar rutinas.',
      });
    }

    const contexto = contextoPerfil(perfil);
    const estado = obtenerEstado(req, contexto.huella, contexto.hoy);
    const restantesAntes = Math.max(0, MAX_SOLICITUDES - estado.solicitadas);

    if (restantesAntes === 0) {
      return res.status(429).json({
        ok: false,
        limite: true,
        restantes: 0,
        error: `Ya usaste las ${MAX_SOLICITUDES} solicitudes de hoy.`,
      });
    }

    const rutina = await generarRutina(contexto);
    if (!rutinaValida(rutina)) {
      throw new Error('El servicio devolvió una rutina vacía.');
    }

    const contada = rutina.fuente === 'groq';
    if (contada) estado.solicitadas += 1;

    estado.rutina = rutina;
    estado.actualizadaEn = Date.now();

    const restantes = Math.max(0, MAX_SOLICITUDES - estado.solicitadas);
    const html = await renderRutina({
      rutina,
      perfil,
      restantes,
      limite: restantes === 0,
      maxSolicitudes: MAX_SOLICITUDES,
    });

    return res.json({
      ok: true,
      html,
      restantes,
      limite: restantes === 0,
      contada,
      fuente: rutina.fuente || 'local',
    });
  } catch (err) {
    console.error('[entrenamiento] error al generar otra rutina:', err.message);
    return res.status(500).json({
      ok: false,
      error: 'No pudimos generar la rutina. Inténtalo de nuevo.',
    });
  }
};

module.exports = {
  index
};
