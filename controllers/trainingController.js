const crypto = require('crypto');
const DashboardModel = require('../models/dashboardModel');
const RoutineModel = require('../models/routineModel');
const PlanEntrenamientoModel = require('../models/trainingModel.js');
const PlanModel = require('../models/planModel');
const { generarRutinaPersonalizada, contextoDesdePerfil } = require('../services/groqService');

const obtenerTiempoSugeridoSeg = (ejercicio = {}, bloque = '') => {
  if (!ejercicio) return null;

  const duracionSegDirecta =
    ejercicio.duracionSeg ??
    ejercicio.duracion_seg ??
    ejercicio.tiempoSeg ??
    ejercicio.tiempo_seg;
  if (duracionSegDirecta !== undefined && duracionSegDirecta !== null && duracionSegDirecta !== '') {
    const seg = Math.round(Number(duracionSegDirecta));
    if (Number.isFinite(seg) && seg > 0) return seg;
  }

  const duracionMinDirecta =
    ejercicio.duracionMin ??
    ejercicio.duracion_min ??
    ejercicio.tiempoMin ??
    ejercicio.tiempo_min;
  if (duracionMinDirecta !== undefined && duracionMinDirecta !== null && duracionMinDirecta !== '') {
    const min = Number(duracionMinDirecta);
    if (Number.isFinite(min) && min > 0) return Math.max(0, Math.round(min * 60));
  }

  if (bloque === 'Rutina principal') {
    return null;
  }

  return null;
};

const aplanarRutina = (rutina = {}) => {
  const lista = [];
  if (Array.isArray(rutina.calentamiento)) {
    rutina.calentamiento.forEach((ej) => {
      if (ej && typeof ej === 'object') {
        lista.push({ ...ej, bloque: 'Calentamiento' });
      }
    });
  }
  if (Array.isArray(rutina.rutinaPrincipal)) {
    rutina.rutinaPrincipal.forEach((ej) => {
      if (ej && typeof ej === 'object') {
        lista.push({ ...ej, bloque: 'Rutina principal' });
      }
    });
  }
  if (Array.isArray(rutina.estiramiento)) {
    rutina.estiramiento.forEach((ej) => {
      if (ej && typeof ej === 'object') {
        lista.push({ ...ej, bloque: 'Estiramiento' });
      }
    });
  }
  return lista;
};

/** true si el cliente tiene un plan de pago activo (Premium). Ante cualquier fallo, Gratis. */
const tienePlanDePago = async (idCliente) => {
  try {
    if (!idCliente) return false;
    const plan = await PlanModel.getEffectivePlan(idCliente);
    return Boolean(plan && plan.esDePago);
  } catch (err) {
    console.error('[entrenamiento] no se pudo resolver el plan:', err.message);
    return false;
  }
};

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

    const esPremium = await tienePlanDePago(perfil.idCliente);

    return res.render('post/entrenamiento', {
      usuario: req.session.usuario,
      esPremium,
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

const activo = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;

    const perfil = await DashboardModel.getPerfil(idUsuario);
    if (!perfil) return res.redirect('/profile');
    if (!perfil.minutosSesion || !perfil.entorno) return res.redirect('/configuracion');

    let rutina = req.session.rutinaIA?.rutina || null;

    if (!rutina) {
      try {
        if (typeof PlanEntrenamientoModel.getUltimaRutinaIA === 'function') {
          rutina = await PlanEntrenamientoModel.getUltimaRutinaIA(perfil.idCliente);
        }
      } catch (errFallback) {
        console.error('[entrenamiento/activo] no se pudo obtener rutina desde BD:', errFallback.message);
      }
    }

    if (!rutina) {
      return res.redirect('/entrenamiento');
    }

    const ejerciciosLista = aplanarRutina(rutina);
    if (!ejerciciosLista.length) {
      return res.redirect('/entrenamiento');
    }

    let idx = parseInt(req.query.i, 10);
    if (Number.isNaN(idx)) idx = 0;
    if (idx < 0) idx = 0;
    if (idx >= ejerciciosLista.length) idx = ejerciciosLista.length - 1;

    const ejercicioActual = ejerciciosLista[idx];
    const bloque = ejercicioActual?.bloque || '';
    const tiempoSugeridoSeg = obtenerTiempoSugeridoSeg(ejercicioActual, bloque);
    const haySugerido = tiempoSugeridoSeg !== null && tiempoSugeridoSeg > 0;

    const esPremium = await tienePlanDePago(perfil.idCliente);

    return res.render('post/entrenamientoActivo', {
      usuario: req.session.usuario,
      esPremium,
      rutina,
      ejerciciosLista,
      ejercicioActual,
      bloque,
      indice: idx,
      total: ejerciciosLista.length,
      tiempoSugeridoSeg,
      haySugerido,
    });
  } catch (err) {
    console.error('[entrenamiento/activo] error al cargar el entrenamiento activo:', err.message);
    return res.status(500).send('No pudimos cargar el entrenamiento activo. Inténtalo de nuevo.');
  }
};

module.exports = { index, activo };