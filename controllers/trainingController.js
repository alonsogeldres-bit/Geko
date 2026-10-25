const crypto = require('crypto');
const DashboardModel = require('../models/dashboardModel');
const RoutineModel = require('../models/routineModel');
const PlanEntrenamientoModel = require('../models/trainingModel.js');
const { generarRutinaPersonalizada, contextoDesdePerfil } = require('../services/groqService');

const COOLDOWN_MS = 30 * 1000; // evita gastar la API con ?nueva=1 repetido

/**
 * Huella de los datos que usa la IA (objetivo, nivel, lugar, tiempo,
 * limitaciones, notas y equipamiento). Sale de contextoDesdePerfil, la misma
 * función que arma el prompt: si un dato entra al prompt, entra a la huella.
 * Si el usuario cambia algo en /configuracion, la huella cambia y la rutina
 * guardada en la sesión se descarta.
 */
const calcularHuella = (perfil) =>
  crypto.createHash('sha1').update(JSON.stringify(contextoDesdePerfil(perfil))).digest('hex');

const index = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;

    const perfil = await DashboardModel.getPerfil(idUsuario);
    if (!perfil) return res.redirect('/profile');
    if (!perfil.minutosSesion || !perfil.entorno) return res.redirect('/configuracion');

    const alt = Math.max(0, parseInt(req.query.alt, 10) || 0);
    const sugerencia = RoutineModel.construirSugerencia(perfil, alt);

    const hoy = RoutineModel.aFechaISO(new Date());
    const huella = calcularHuella(perfil);
    const cache = req.session.rutinaIA;
    const cacheValida = cache && cache.fecha === hoy && cache.huella === huella;
    const enCooldown = cache && Date.now() - cache.generadaEn < COOLDOWN_MS;
    const forzar = req.query.nueva === '1' && !enCooldown;

    let rutina = null;
    let errorRutina = null;

    if (cacheValida && !forzar) {
      rutina = cache.rutina;
    } else {
      try {
        rutina = await generarRutinaPersonalizada({ perfil });
        req.session.rutinaIA = { fecha: hoy, huella, rutina, generadaEn: Date.now() };

        /* Se guarda en plan_entrenamiento / detalle_plan_entrenamiento. Si la base
           falla, el usuario igual ve su rutina: solo se registra el error. */
        try {
          await PlanEntrenamientoModel.guardarRutinaIA({
            idCliente: perfil.idCliente,
            rutina,
            nivelFisico: perfil.nivelFisico,
            fecha: hoy,
            diaSemana: RoutineModel.DIAS_SEMANA[RoutineModel.indiceHoy()],
          });
        } catch (errGuardado) {
          console.error('[entrenamiento] no se pudo guardar la rutina en la base:', errGuardado.message);
        }
      } catch (err) {
        console.error('[entrenamiento] error al generar la rutina:', err.message);
        errorRutina = 'No pudimos generar tu rutina ahora. Inténtalo de nuevo en un momento.';
      }
    }

    return res.render('post/entrenamiento', {
      usuario: req.session.usuario,
      perfil,
      sugerencia,
      rutina,
      errorRutina,
    });
  } catch (err) {
    console.error('[entrenamiento] error al cargar los datos:', err.message);
    return res.status(500).send('No pudimos cargar el entrenamiento. Inténtalo de nuevo.');
  }
};

module.exports = { index };