/* ===========================================
   CUESTIONARIO DE RETROALIMENTACIÓN POST-ENTRENAMIENTO

   GET  /entrenamiento/retroalimentacion          -> página para responder
        el cuestionario pendiente (omitido antes o sin contestar)
   POST /entrenamiento/retroalimentacion          -> guarda las respuestas,
        genera la recomendación y confirma el registro
   POST /entrenamiento/retroalimentacion/omitir   -> lo deja pendiente sin
        obligar al usuario (podrá responderlo más tarde)

   El cuestionario evalúa una sesión REAL: la fecha que llega (o hoy)
   debe tener una sesión del cliente dentro de los últimos 7 días.
   =========================================== */

const DashboardModel = require('../models/dashboardModel');
const PlanModel = require('../models/planModel');
const SesionModel = require('../models/sesionEntrenamientoModel');
const RetroModel = require('../models/retroalimentacionModel');
const RetroService = require('../services/retroalimentacionService');

const VENTANA_DIAS = 7;

/** true si el cliente tiene plan de pago activo (look Premium en la vista). */
const tienePlanDePago = async (idCliente) => {
  try {
    if (!idCliente) return false;
    const plan = await PlanModel.getEffectivePlan(idCliente);
    return Boolean(plan && plan.esDePago);
  } catch (err) {
    console.error('[retro] no se pudo resolver el plan:', err.message);
    return false;
  }
};

const hoyISO = () => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/** "2026-11-10" válido, o null. */
const parsearFecha = (valor) => {
  const t = String(valor || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return null;
  const d = new Date(`${t}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : t;
};

/** ¿La fecha está dentro de la ventana de días permitida? */
const dentroDeVentana = (fecha) => {
  const limite = new Date();
  limite.setHours(12, 0, 0, 0);
  limite.setDate(limite.getDate() - VENTANA_DIAS);
  const d = new Date(`${fecha}T12:00:00`);
  return d.getTime() >= limite.getTime();
};

/** Perfil del usuario logueado, o null (404 si el perfil no existe). */
const obtenerPerfil = async (req, res) => {
  const perfil = await DashboardModel.getPerfil(req.session.usuario.id_usuario);
  if (!perfil || !perfil.idCliente) {
    res.status(404).json({ ok: false, message: 'Completa tu perfil primero.' });
    return null;
  }
  return perfil;
};

/** Fecha a evaluar: la del body (o query) si es válida, si no hoy. */
const fechaAEvaluar = (req) => {
  const cruda = (req.body && req.body.fecha) || req.query.fecha || '';
  return parsearFecha(cruda) || hoyISO();
};

/**
 * GET /entrenamiento/retroalimentacion
 * Muestra el cuestionario de la última sesión que se puede contestar
 * (sin responder u omitida, dentro de los últimos 7 días).
 */
const mostrar = async (req, res) => {
  try {
    const perfil = await DashboardModel.getPerfil(req.session.usuario.id_usuario);
    if (!perfil) return res.redirect('/profile');

    const pendiente = await RetroModel.getRespondible(perfil.idCliente, VENTANA_DIAS);
    const esPremium = await tienePlanDePago(perfil.idCliente);

    return res.render('post/retroalimentacion', {
      usuario: req.session.usuario,
      perfil,
      esPremium,
      pendiente, // { fecha, titulo } | null
    });
  } catch (err) {
    console.error('[retro] error al cargar el cuestionario:', err.message);
    return res.status(500).send('No pudimos cargar el cuestionario. Inténtalo de nuevo.');
  }
};

/**
 * POST /entrenamiento/retroalimentacion
 * Body (JSON): { fecha?, esfuerzo: 1..4, satisfaccion: 1..5,
 *                molestias: ['ninguna'|zonas...], comentario? }
 * Guarda las respuestas, genera la recomendación y confirma el registro.
 */
const guardar = async (req, res) => {
  try {
    const perfil = await obtenerPerfil(req, res);
    if (!perfil) return;

    const validacion = RetroService.validarRespuestas(req.body || {});
    if (!validacion.ok) {
      return res.status(400).json({
        ok: false,
        message: validacion.errores.join(' '),
        errores: validacion.errores,
      });
    }
    const respuestas = validacion.respuestas;

    const fecha = fechaAEvaluar(req);
    if (!dentroDeVentana(fecha)) {
      return res.status(400).json({ ok: false, message: 'Esa sesión ya no se puede evaluar.' });
    }

    const sesion = await SesionModel.getSesionDeFecha(perfil.idCliente, fecha);
    if (!sesion) {
      return res.status(404).json({ ok: false, message: 'No encontramos esa sesión tuya.' });
    }

    /* La recomendación se genera antes de guardar para quedar en la fila. */
    const { texto, origen } = await RetroService.generarRecomendacion({
      respuestas,
      perfil,
    });

    await RetroModel.guardarRespuestas({
      idCliente: perfil.idCliente,
      fecha,
      ...respuestas,
      recomendacion: texto,
      origen,
    });

    /* El esfuerzo también queda en la sesión, igual que el panel RPE
       antiguo: la rutina y el dashboard lo siguen leyendo de ahí. */
    try {
      await SesionModel.actualizarEsfuerzoEnFecha(perfil.idCliente, fecha, respuestas.esfuerzo);
    } catch (errEsfuerzo) {
      console.error('[retro] no se pudo guardar el esfuerzo en la sesión:', errEsfuerzo.message);
    }

    return res.json({
      ok: true,
      message: 'Respuestas registradas.',
      recomendacion: texto,
    });
  } catch (err) {
    console.error('[retro] error al guardar las respuestas:', err.message);
    return res.status(500).json({ ok: false, message: 'No pudimos guardar tus respuestas.' });
  }
};

/**
 * POST /entrenamiento/retroalimentacion/omitir   body: { fecha? }
 * Deja el cuestionario sin obligar al usuario. No borra nada: la sesión
 * queda marcada como "Omitida" y el usuario puede responderla más tarde
 * desde /entrenamiento/retroalimentacion (accesible desde Mi progreso).
 */
const omitir = async (req, res) => {
  try {
    const perfil = await obtenerPerfil(req, res);
    if (!perfil) return;

    const fecha = fechaAEvaluar(req);
    if (!dentroDeVentana(fecha)) {
      return res.json({ ok: true, message: 'Sin problema, puedes seguir entrenando.' });
    }

    const sesion = await SesionModel.getSesionDeFecha(perfil.idCliente, fecha);
    if (sesion) {
      await RetroModel.marcarOmitida(perfil.idCliente, fecha);
    }

    return res.json({
      ok: true,
      message: 'Sin problema. Puedes responder el cuestionario más tarde.',
    });
  } catch (err) {
    console.error('[retro] error al omitir el cuestionario:', err.message);
    return res.status(500).json({ ok: false, message: 'No pudimos cerrar el cuestionario.' });
  }
};

module.exports = { mostrar, guardar, omitir };
