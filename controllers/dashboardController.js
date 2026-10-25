const DashboardModel = require('../models/dashboardModel');
const RoutineModel = require('../models/routineModel');
const PlanModel = require('../models/planModel');
const SugerenciaUsoModel = require('../models/sugerenciaUsoModel');

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

const calcularTMB = (datos) => {
  if (!datos) return null;

  const { sexo, fechaNacimiento, peso, altura } = datos;

  if (!sexo || !fechaNacimiento || peso == null || altura == null) {
    return null;
  }

  const pesoKg = Number(peso);
  const alturaCm = Number(altura);

  if (
    !Number.isFinite(pesoKg) ||
    !Number.isFinite(alturaCm) ||
    pesoKg <= 0 ||
    alturaCm <= 0
  ) {
    return null;
  }

  const fecha = String(fechaNacimiento).slice(0, 10);
  const nacimiento = new Date(`${fecha}T12:00:00`);

  if (Number.isNaN(nacimiento.getTime())) return null;

  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();

  if (
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() &&
      hoy.getDate() < nacimiento.getDate())
  ) {
    edad--;
  }

  if (edad < 0 || edad > 120) return null;

  let tmb;

  if (sexo === 'M') {
    tmb = 10 * pesoKg + 6.25 * alturaCm - 5 * edad + 5;
  } else if (sexo === 'F') {
    tmb = 10 * pesoKg + 6.25 * alturaCm - 5 * edad - 161;
  } else {
    return null;
  }

  return {
    tmb: Math.round(tmb),
    peso: pesoKg,
    altura: alturaCm,
    edad,
  };
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

    // Plan Gratis: se retoma la variante de esta semana (1/3..3/3).
    // Premium: cambios ilimitados, siempre empieza por la primera.
    const esPremium = await tienePlanDePago(perfil.idCliente);
    let alt = 0;

    if (!esPremium) {
      const uso = await SugerenciaUsoModel.getUso(perfil.idCliente);
      alt = uso.indice - 1;
    }

    const sesiones = await DashboardModel.getSesiones(perfil.idCliente);
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
 *
 * Premium: devuelve la siguiente variante (rotación infinita).
 * Gratis: el servidor decide la variante y consume 1 de las 3 semanales.
 *   - Si ya vio las 3, responde 402 para que el cliente abra el modal
 *     de mejora de plan (no se consume nada).
 *   - El `alt` del cliente se ignora: evita saltarse el límite.
 */
const sugerencia = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;

    const perfil = await DashboardModel.getPerfil(idUsuario);
    if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' });

    const esPremium = await tienePlanDePago(perfil.idCliente);

    if (esPremium) {
      const alt = Math.max(0, parseInt(req.body && req.body.alt, 10) || 0);
      return res.json(RoutineModel.construirSugerencia(perfil, alt, true));
    }

    const uso = await SugerenciaUsoModel.avanzarUso(perfil.idCliente);

    if (!uso.existe) {
      return res.status(404).json({ error: 'Perfil no encontrado' });
    }

    if (uso.alcanzado) {
      return res.status(402).json({
        error: 'LIMITE_SEMANAL',
        message: 'Ya viste tus 3 sugerencias de esta semana. Con Premium los cambios son ilimitados.',
        upgrade: '/planes',
      });
    }

    return res.json({
      ...RoutineModel.construirSugerencia(perfil, uso.indice - 1, false),
      limiteSemanal: uso,
    });
  } catch (err) {
    console.error('[dashboard] error al cambiar la sugerencia:', err.message);
    return res.status(500).json({ error: 'No pudimos cambiar la sugerencia.' });
  }
};

module.exports = {
  index,
  sugerencia
};