/* ===========================================
   CONTROLADOR DE ENTRENAMIENTO
   GET /entrenamiento
   Muestra la rutina de hoy: la sugerencia del perfil
   y el detalle ejercicio a ejercicio generado con IA.
   =========================================== */

const DashboardModel = require('../models/dashboardModel');
const RoutineModel = require('../models/routineModel');
const { generarRutinaPersonalizada } = require('../services/geminiService');

/* Clave de la sesión donde se guarda la rutina del día. */
const CACHE_RUTINA = 'rutinaIA';

/**
 * Rutina de la sesión para hoy, si ya se generó.
 */
const rutinaCacheada = (req) => {
  const cache = req.session[CACHE_RUTINA];
  if (!cache || !cache.rutina) return null;
  if (cache.fecha !== RoutineModel.aFechaISO(new Date())) return null;
  return cache.rutina;
};

/**
 * Genera la rutina con IA y la deja cacheada en la sesión por día,
 * para no llamar a la API en cada visita a la pantalla.
 * `?nueva=1` fuerza una rutina nueva.
 */
const obtenerRutinaIA = async (req, perfil) => {
  const cacheada = rutinaCacheada(req);
  const forzar = req.query.nueva === '1';

  if (cacheada && !forzar) {
    return { rutina: cacheada, error: null };
  }

  try {
    const rutina = await generarRutinaPersonalizada({
      tiempoDisponible: perfil.minutosSesion,
      lugarEntrenamiento: perfil.entorno,
    });

    req.session[CACHE_RUTINA] = {
      fecha: RoutineModel.aFechaISO(new Date()),
      rutina,
    };

    return { rutina, error: null };
  } catch (err) {
    console.error('[entrenamiento] error al generar la rutina con IA:', err.message);

    /* Si ya había una rutina de hoy, se conserva y se avisa que no se pudo refrescar. */
    if (cacheada) {
      return {
        rutina: cacheada,
        error: 'No pudimos generar una rutina nueva. Te mostramos la de hoy.',
      };
    }

    return {
      rutina: null,
      error: 'No pudimos generar la rutina con IA en este momento. Inténtalo de nuevo en un rato.',
    };
  }
};

/**
 * GET /entrenamiento
 * La sugerencia del perfil arma el encabezado; la rutina con IA arma
 * el detalle. Si la IA falla, la pantalla sigue funcionando con la
 * sugerencia y un mensaje de error.
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

    const { rutina, error } = await obtenerRutinaIA(req, perfil);

    return res.render('post/entrenamiento', {
      usuario: req.session.usuario,
      perfil,
      sugerencia,
      rutina,
      error,
    });
  } catch (err) {
    console.error('[entrenamiento] error al cargar los datos:', err.message);
    return res.status(500).send('No pudimos cargar el entrenamiento. Inténtalo de nuevo.');
  }
};

module.exports = {
  index,
};
