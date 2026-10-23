const crypto = require('crypto');
const path = require('path');
const ejs = require('ejs');
const DashboardModel = require('../models/dashboardModel');
const { generarRutinaPersonalizada } = require('../services/groqService');

/* Estado de la rutina del día en la sesión del usuario. */
const CLAVE_ESTADO = 'estadoEntrenamiento';

/* Clave antigua, solo para migrar sesiones que ya estaban abiertas. */
const CLAVE_ANTERIOR = 'rutinaEntrenamiento';

/* Máximo de rutinas nuevas que se pueden pedir con "Generar otra rutina". */
const MAX_SOLICITUDES = 3;

/* Una rutina de respaldo se reintenta a los 5 minutos: si la API vuelve,
   no hay que esperar hasta el día siguiente para ver la rutina con IA. */
const TTL_RESPALDO_MS = 5 * 60 * 1000;

/* Vista parcial que se devuelve al generar una rutina sin recargar la página. */
const VISTA_RUTINA = path.join(__dirname, '..', 'views', 'partials', 'rutina.ejs');

/** Fecha local en formato YYYY-MM-DD (sin el corrimiento de zona de toISOString). */
const fechaLocalISO = (fecha = new Date()) => {
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${fecha.getFullYear()}-${mes}-${dia}`;
};

/**
 * Huella de los datos que influyen en la rutina. Si el usuario cambia
 * su objetivo, minutos, entorno, nivel, lesiones o equipamiento en
 * /configuracion, la huella cambia y la rutina se vuelve a generar.
 */
const huellaPerfil = (perfil) => crypto
  .createHash('sha1')
  .update(JSON.stringify({
    objetivo: perfil.objetivo || null,
    observacionObjetivo: perfil.observacionObjetivo || null,
    entorno: perfil.entorno || null,
    minutosSesion: perfil.minutosSesion || null,
    nivelFisico: perfil.nivelFisico || null,
    pesoKg: perfil.pesoKg || null,
    alturaCm: perfil.alturaCm || null,
    lesiones: perfil.lesiones || [],
    equipamiento: perfil.equipamiento || [],
    dias: perfil.dias || [],
  }))
  .digest('hex');

/** Normaliza los datos del perfil que usan el prompt y la huella. */
const contextoPerfil = (perfil) => {
  const minutosSesion = Number(perfil.minutosSesion) || 45;
  const entorno = perfil.entorno || 'gimnasio';
  const perfilRutina = { ...perfil, minutosSesion, entorno };

  return {
    minutosSesion,
    entorno,
    perfilRutina,
    huella: huellaPerfil(perfilRutina),
    hoy: fechaLocalISO(),
  };
};

/** Llama al servicio de IA (que ya incluye su propio respaldo local). */
const generarRutina = (contexto) => generarRutinaPersonalizada({
  tiempoDisponible: contexto.minutosSesion,
  lugarEntrenamiento: contexto.entorno,
  perfil: contexto.perfilRutina,
});

/**
 * Devuelve el estado vigente del día. Si cambió el perfil o la fecha,
 * empieza de cero (esto también reinicia el contador de solicitudes).
 */
const obtenerEstado = (req, huella, hoy) => {
  const actual = req.session[CLAVE_ESTADO];

  if (actual && actual.huella === huella && actual.fecha === hoy) {
    actual.solicitadas = Math.max(
      0,
      Math.min(MAX_SOLICITUDES, Number(actual.solicitadas) || 0)
    );
    if (!actual.rutina) actual.rutina = null;
    if (!Number.isFinite(Number(actual.actualizadaEn))) actual.actualizadaEn = 0;
    return actual;
  }

  /* Migración de la sesión anterior, que guardaba la rutina suelta. */
  const anterior = req.session[CLAVE_ANTERIOR];
  if (anterior && anterior.huella === huella && anterior.fecha === hoy) {
    const migrado = {
      huella,
      fecha: hoy,
      solicitadas: 0,
      rutina: anterior,
      actualizadaEn: anterior.generadaEn || Date.now(),
    };
    req.session[CLAVE_ESTADO] = migrado;
    delete req.session[CLAVE_ANTERIOR];
    return migrado;
  }

  const estado = {
    huella,
    fecha: hoy,
    solicitadas: 0,
    rutina: null,
    actualizadaEn: 0,
  };
  req.session[CLAVE_ESTADO] = estado;
  return estado;
};

/** Un respaldo local viejo se intenta regenerar con la IA al volver a entrar. */
const respaldoVencido = (estado) => Boolean(
  estado.rutina
  && estado.rutina.fuente === 'local'
  && Date.now() - (estado.actualizadaEn || 0) > TTL_RESPALDO_MS
);

/** Una rutina cacheada solo sirve si tiene al menos un ejercicio principal. */
const rutinaValida = (rutina) => Boolean(
  rutina
  && Array.isArray(rutina.rutinaPrincipal)
  && rutina.rutinaPrincipal.length > 0
);

/** Renderiza el parcial que sustituye la rutina en el navegador. */
const renderRutina = (datos) => ejs.renderFile(VISTA_RUTINA, datos);

/**
 * GET /entrenamiento
 * Muestra la rutina del día. Se genera con Groq bajo demanda y se
 * guarda en la sesión para no repetir la llamada en cada visita.
 * Con ?nueva=1 se fuerza una rutina nueva (fallback sin JavaScript).
 */
const index = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;

    const perfil = await DashboardModel.getPerfil(idUsuario);
    if (!perfil) return res.redirect('/profile');

    const contexto = contextoPerfil(perfil);
    const estado = obtenerEstado(req, contexto.huella, contexto.hoy);

    const forzar = req.query.nueva === '1';
    const limiteAlcanzado = estado.solicitadas >= MAX_SOLICITUDES;
    let aviso = null;

    if (forzar) {
      if (limiteAlcanzado) {
        aviso = `Ya usaste las ${MAX_SOLICITUDES} solicitudes de hoy.`;
      } else {
        const rutina = await generarRutina(contexto);
        if (rutina.fuente === 'groq') estado.solicitadas += 1;
        estado.rutina = rutina;
        estado.actualizadaEn = Date.now();
      }
    }

    /* Un respaldo local vencido se reintenta solo si aún quedan solicitudes:
       así el reintento no se convierte en una generación extra gratis. */
    if (respaldoVencido(estado) && estado.solicitadas < MAX_SOLICITUDES) {
      estado.rutina = null;
    }

    /* La primera rutina automática del día no descuenta solicitudes. */
    if (!rutinaValida(estado.rutina)) {
      estado.rutina = await generarRutina(contexto);
      estado.actualizadaEn = Date.now();
    }

    const restantes = Math.max(0, MAX_SOLICITUDES - estado.solicitadas);

    return res.render('post/entrenamiento', {
      usuario: req.session.usuario,
      perfil,
      rutina: estado.rutina,
      restantes,
      limite: restantes === 0,
      maxSolicitudes: MAX_SOLICITUDES,
      aviso,
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
  index,
  generarOtra,
};
