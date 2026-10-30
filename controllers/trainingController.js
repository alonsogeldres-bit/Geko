const crypto = require('crypto');
const DashboardModel = require('../models/dashboardModel');
const RoutineModel = require('../models/routineModel');
const PlanEntrenamientoModel = require('../models/trainingModel.js');
const PlanModel = require('../models/planModel');
const SesionModel = require('../models/sesionEntrenamientoModel');
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

/* ---------- Reproductor: tiempos por serie y descansos ---------- */

const SEG_POR_REP = 3;          // ritmo medio estimado por repetición
const MIN_SERIE_SEG = 15;       // una serie nunca dura menos de 15 s
const MAX_SERIE_SEG = 75;       // ni más de 75 s
const MIN_ISOMETRICO_SEG = 20;  // sostén mínimo (plancha, superman…)
const MAX_ISOMETRICO_SEG = 90;
const MAX_DESCANSO_SEG = 180;

const limitarSeg = (valor, min, max) => Math.min(max, Math.max(min, Math.round(valor)));

/** "Plancha frontal" / "30 s de sostén" → ejercicio isométrico. */
const PATRON_ISOMETRICO = /plancha|plank|superman|hollow|isometric|isométric|sost[eé]n|sostener|wall\s?sit/i;

const esIsometrico = (nombre, descripcion) =>
  PATRON_ISOMETRICO.test(String(nombre || '')) ||
  /isom[eé]tric|sost[eé]n|sostener/i.test(String(descripcion || ''));

/** "12 por lado" / "10 cada pierna" → el tiempo se duplica. */
const esPorLado = (repeticiones) =>
  /por\s+lado|cada\s+lado|por\s+pierna|cada\s+pierna|por\s+brazo|cada\s+brazo/i.test(
    String(repeticiones || '')
  );

/**
 * Duración de UNA serie.
 * - Calentamiento/estiramiento: los minutos que dio la IA.
 * - Principal con repeticiones en tiempo ("30 s"): ese tiempo.
 * - Principal con repeticiones numéricas: reps × 3 s (o × 6 s si es por lado).
 * - Isométricos: el número de reps se interpreta como segundos de sostén.
 */
const duracionSerieSeg = (ejercicio, esPrincipal) => {
  if (!esPrincipal) {
    return limitarSeg(obtenerTiempoSugeridoSeg(ejercicio, ejercicio.bloque) || 60, 15, 600);
  }

  const info = PlanEntrenamientoModel.interpretarRepeticiones(ejercicio.repeticiones);
  if (info.duracionSeg && info.duracionSeg > 0) return info.duracionSeg;

  const reps = info.repeticiones && info.repeticiones > 0 ? info.repeticiones : 10;
  const isometrico = esIsometrico(ejercicio.nombre, ejercicio.descripcion);
  const factor = esPorLado(ejercicio.repeticiones) ? SEG_POR_REP * 2 : SEG_POR_REP;

  if (isometrico) {
    return limitarSeg(reps, MIN_ISOMETRICO_SEG, MAX_ISOMETRICO_SEG);
  }

  return limitarSeg(reps * factor, MIN_SERIE_SEG, MAX_SERIE_SEG);
};

/** Convierte un ejercicio aplanado en un paso del reproductor. */
const crearPaso = (ejercicio, i) => {
  const esPrincipal = ejercicio.bloque === 'Rutina principal';
  const series = esPrincipal ? Math.max(1, parseInt(ejercicio.series, 10) || 1) : 1;
  const repeticiones = esPrincipal ? String(ejercicio.repeticiones ?? '').trim() : '';
  const descansoSeg = esPrincipal
    ? limitarSeg(parseInt(ejercicio.descansoSeg, 10) || 0, 0, MAX_DESCANSO_SEG)
    : 0;
  const duracionSeg = duracionSerieSeg(ejercicio, esPrincipal);
  const totalSeg = series * duracionSeg + Math.max(0, series - 1) * descansoSeg;

  return {
    i,
    bloque: ejercicio.bloque,
    nombre: String(ejercicio.nombre || 'Ejercicio').slice(0, 90),
    descripcion: String(ejercicio.descripcion || '').slice(0, 500),
    esPrincipal,
    series,
    repeticiones,
    descansoSeg,
    duracionSeg,
    totalSeg,
    esIsometrico: esIsometrico(ejercicio.nombre, ejercicio.descripcion),
    esPorLado: esPorLado(repeticiones),
  };
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
    if (!perfil.minutosSesion || !perfil.entorno) return res.redirect('/configuracion/entrenamiento');

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
    if (!perfil.minutosSesion || !perfil.entorno) return res.redirect('/configuracion/entrenamiento');

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

    const reproductor = ejerciciosLista.map((ejercicio, i) => crearPaso(ejercicio, i));

    let idx = parseInt(req.query.i, 10);
    if (Number.isNaN(idx)) idx = 0;
    if (idx < 0) idx = 0;
    if (idx >= reproductor.length) idx = reproductor.length - 1;

    const ejercicioActual = ejerciciosLista[idx];
    const bloque = ejercicioActual?.bloque || '';
    const tiempoSugeridoSeg = reproductor[idx].duracionSeg;
    const haySugerido = tiempoSugeridoSeg !== null && tiempoSugeridoSeg > 0;
    const duracionTotalSeg = reproductor.reduce((total, paso) => total + paso.totalSeg, 0);

    const esPremium = await tienePlanDePago(perfil.idCliente);

    return res.render('post/entrenamientoActivo', {
      usuario: req.session.usuario,
      esPremium,
      rutina,
      ejerciciosLista,
      reproductor,
      duracionTotalSeg,
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

/**
 * POST /entrenamiento/finalizar
 * Se llama UNA vez cuando el usuario termina de entrenar y suma el día a la racha.
 * Body (JSON o formulario), todo opcional: { titulo, duracionSegundos, ejerciciosCompletados }
 * Respuesta: { ok: true, racha, mejorRacha, sesiones, meta }
 */
const finalizar = async (req, res) => {
  try {
    const perfil = await DashboardModel.getPerfil(req.session.usuario.id_usuario);
    if (!perfil || !perfil.idCliente) {
      return res.status(400).json({ ok: false, message: 'Completa tu perfil primero.' });
    }

    const b = req.body || {};
    await SesionModel.registrar({
      idCliente: perfil.idCliente,
      titulo: b.titulo,
      duracionSegundos: b.duracionSegundos,
      ejerciciosCompletados: b.ejerciciosCompletados,
    });

    // Se devuelve la racha ya actualizada para que la pantalla pueda mostrarla.
    const sesiones = await DashboardModel.getSesiones(perfil.idCliente);
    const resumen = RoutineModel.calcularResumen(sesiones, perfil.dias, perfil.diasSemana);

    return res.json({
      ok: true,
      racha: resumen.racha,
      mejorRacha: resumen.mejorRacha,
      sesiones: resumen.sesiones,
      meta: resumen.meta,
    });
  } catch (err) {
    console.error('[entrenamiento] no se pudo registrar el entrenamiento:', err.message);
    return res.status(500).json({ ok: false, message: 'No pudimos registrar tu entrenamiento.' });
  }
};

module.exports = { index, activo, finalizar };