const DashboardModel = require('../models/dashboardModel');
const PlanModel = require('../models/planModel');
const ProgressModel = require('../models/progressModel');
const ProgressService = require('../services/progressService');
const RetroModel = require('../models/retroalimentacionModel');

const NIVELES = ['Alto', 'Medio', 'Bajo'];

const parseNumero = (v) => {
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const tienePlanDePago = async (idCliente) => {
  try {
    if (!idCliente) return false;
    const plan = await PlanModel.getEffectivePlan(idCliente);
    return Boolean(plan && plan.esDePago);
  } catch (err) {
    console.error('[progreso] no se pudo resolver el plan:', err.message);
    return false;
  }
};

const index = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    const perfil = await DashboardModel.getPerfil(idUsuario);
    if (!perfil) return res.redirect('/profile');

    const idCliente = perfil.idCliente;
    const esPremium = await tienePlanDePago(idCliente);

    const semanas = Math.min(26, Math.max(4, parseInt(req.query.semanas, 10) || 8));

    const [sesiones, mediciones, retroHistorial, retroPendiente] = await Promise.all([
      ProgressModel.getSesiones(idCliente, 500),
      ProgressModel.getMediciones(idCliente, 100),
      RetroModel.getHistorial(idCliente, 10),
      RetroModel.getPendiente(idCliente),
    ]);

    const progreso = ProgressService.calcularProgreso({
      sesiones,
      mediciones,
      perfil,
      semanas,
    });

    return res.render('post/progreso', {
      usuario: req.session.usuario,
      perfil,
      esPremium,
      progreso,
      semanas,
      retroHistorial,   // [{ fecha, esfuerzo, molestias, satisfaccion, recomendacion, aplicada }]
      retroPendiente,   // { fecha, titulo } | null
      errorMedicion: null,
      okMedicion: req.query.ok === '1',
    });
  } catch (err) {
    console.error('[progreso] error al cargar:', err.message);
    return res.status(500).send('No pudimos cargar tu progreso. Inténtalo de nuevo.');
  }
};

const registrarMedicion = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    const perfil = await DashboardModel.getPerfil(idUsuario);
    if (!perfil) return res.redirect('/profile');

    const peso = parseNumero(req.body && req.body.pesoKg);
    const altura = parseNumero(req.body && req.body.alturaCm);
    const nivel = String((req.body && req.body.nivelFisico) || '').trim();

    const errores = [];
    if (peso === null || peso <= 0 || peso > 400) errores.push('peso');
    if (altura === null || altura <= 0 || altura > 260) errores.push('altura');
    if (!NIVELES.includes(nivel)) errores.push('nivel');

    if (errores.length) {
      const sesiones = await ProgressModel.getSesiones(perfil.idCliente, 500);
      const mediciones = await ProgressModel.getMediciones(perfil.idCliente, 100);
      const semanas = Math.min(26, Math.max(4, parseInt(req.query.semanas, 10) || 8));
      const progreso = ProgressService.calcularProgreso({ sesiones, mediciones, perfil, semanas });
      let esPremium = false;
      try {
        const plan = await PlanModel.getEffectivePlan(perfil.idCliente);
        esPremium = Boolean(plan && plan.esDePago);
      } catch (e) { esPremium = false; }
      return res.status(400).render('post/progreso', {
        usuario: req.session.usuario,
        perfil,
        esPremium,
        progreso,
        semanas,
        errorMedicion: 'Revisa los valores ingresados.',
        okMedicion: false,
      });
    }

    await ProgressModel.registrarMedicion(perfil.idCliente, {
      nivelFisico: nivel,
      alturaCm: Math.round(altura * 100) / 100,
      pesoKg: Math.round(peso * 10) / 10,
    });

    return res.redirect('/progreso?ok=1');
  } catch (err) {
    console.error('[progreso] no se pudo registrar la medición:', err.message);
    return res.status(500).send('No pudimos registrar tu medición. Inténtalo de nuevo.');
  }
};

module.exports = { index, registrarMedicion };
