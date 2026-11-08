/* ===========================================
   CHAT DE LA MASCOTA GEKO
   POST /geko/chat                 -> responde una pregunta o PROPONE cambios de rutina
   POST /geko/chat/rutina/aceptar  -> aplica la propuesta pendiente (solo la rutina)
   POST /geko/chat/rutina/rechazar -> descarta la propuesta pendiente
   POST /geko/chat/reset           -> olvida la conversación de esta sesión

   El chat lee el perfil y, según la pregunta, solo las fuentes de contexto que
   el router considera relevantes. Lo ÚNICO que puede modificar es la rutina de
   hoy, y solo cuando el usuario acepta la tarjeta de cambio: nunca escribe en
   el perfil, las mediciones, el plan ni ningún dato personal.
   =========================================== */

const DashboardModel = require('../models/dashboardModel');
const RoutineModel = require('../models/routineModel');
const PlanModel = require('../models/planModel');
const ProfileModel = require('../models/profileModel');
const ProgressModel = require('../models/progressModel');
const { responderChat, MAX_HISTORIAL, MAX_MENSAJE_USUARIO } = require('../services/gekoChatService');
const { seleccionarFuentes } = require('../services/gekoContextRouter');
const { FUENTES } = require('../services/gekoContextSources');
const RoutineChanges = require('../services/gekoRoutineChangeService');
const PlanEntrenamientoModel = require('../models/trainingModel');

const MAX_MENSAJES_POR_SESION = 40;  // preguntas del usuario en toda la sesión
const COOLDOWN_MS = 1200;            // evita dobles envíos seguidos
const VIGENCIA_PROPUESTA_MS = 30 * 60 * 1000; // una propuesta sin responder caduca a los 30 min

/** true si el cliente tiene un plan de pago activo. Ante cualquier fallo, Gratis. */
const tienePlanDePago = async (idCliente) => {
  try {
    if (!idCliente) return false;
    const plan = await PlanModel.getEffectivePlan(idCliente);
    return Boolean(plan && plan.esDePago);
  } catch (err) {
    console.error('[geko-chat] no se pudo resolver el plan:', err.message);
    return false;
  }
};

/** Estado del chat en la sesión (sin base de datos). */
const leerEstado = (req) => {
  const actual = req.session.gekoChat;
  if (!actual || typeof actual !== 'object') {
    return { historial: [], ultimo: 0, total: 0, restricciones: { sinEquipo: [], zonas: [] }, propuesta: null };
  }
  const r = actual.restricciones && typeof actual.restricciones === 'object' ? actual.restricciones : {};
  return {
    historial: Array.isArray(actual.historial) ? actual.historial : [],
    ultimo: Number(actual.ultimo) || 0,
    total: Number(actual.total) || 0,
    restricciones: {
      sinEquipo: Array.isArray(r.sinEquipo) ? r.sinEquipo : [],
      zonas: Array.isArray(r.zonas) ? r.zonas : [],
    },
    propuesta: actual.propuesta && typeof actual.propuesta === 'object' ? actual.propuesta : null,
  };
};

const guardarEstado = (req, estado) => {
  req.session.gekoChat = {
    historial: estado.historial.slice(-MAX_HISTORIAL),
    ultimo: estado.ultimo,
    total: estado.total,
    restricciones: estado.restricciones,
    propuesta: estado.propuesta || null,
  };
};

/**
 * Pedido de cambio de rutina ("no tengo mancuernas", "me duele la rodilla"...).
 * Devuelve { texto, propuesta } o null si no hay nada que gestionar aquí
 * (entonces el mensaje sigue su camino normal hacia el chat).
 * No escribe nada: la propuesta queda en la sesión hasta que el usuario acepte.
 */
const gestionarPedidoDeCambio = async (req, mensaje, peticion, estado, idUsuario) => {
  const perfil = await DashboardModel.getPerfil(idUsuario);
  if (!perfil) return { error: { status: 404, message: 'Completa tu perfil para que pueda ayudarte.' } };

  const cache = req.session.rutinaIA;
  if (!cache || !cache.rutina) {
    estado.propuesta = null;
    return {
      texto:
        'Todavía no tienes una rutina generada para hoy. Entra a "Mi rutina" (/entrenamiento) para crearla y luego te ayudo a cambiar lo que necesites.',
      propuesta: null,
    };
  }

  /* Lo que dijo ("sin mancuernas", "rodilla") solo filtra esta propuesta y
     vive en la sesión del chat: el perfil no se toca. */
  estado.restricciones = RoutineChanges.fusionarRestricciones(estado.restricciones, peticion);

  const resultado = await RoutineChanges.proponerCambios({
    mensaje,
    perfil,
    rutina: cache.rutina,
    restricciones: estado.restricciones,
  });

  if (!resultado.cambios.length) {
    estado.propuesta = null;
    return { texto: resultado.texto, propuesta: null };
  }

  estado.propuesta = RoutineChanges.nuevaPropuesta({
    cambios: resultado.cambios,
    generadaEn: cache.generadaEn,
  });
  return { texto: resultado.texto, propuesta: RoutineChanges.resumirParaCliente(estado.propuesta) };
};

const chat = async (req, res) => {
  try {
    const mensaje = String((req.body && req.body.mensaje) ?? '').trim();

    if (!mensaje) {
      return res.status(400).json({ ok: false, message: 'Escríbeme una pregunta.' });
    }
    if (mensaje.length > MAX_MENSAJE_USUARIO) {
      return res.status(400).json({
        ok: false,
        message: `La pregunta es muy larga (máximo ${MAX_MENSAJE_USUARIO} caracteres).`,
      });
    }

    const ahora = Date.now();
    const estado = leerEstado(req);

    if (ahora - estado.ultimo < COOLDOWN_MS) {
      return res.status(429).json({ ok: false, message: 'Espera un segundo antes de volver a escribir.' });
    }
    if (estado.total >= MAX_MENSAJES_POR_SESION) {
      return res.status(429).json({
        ok: false,
        message: 'Llegamos al límite de mensajes de esta sesión. Recarga la página para seguir conversando.',
      });
    }

    const idUsuario = req.session.usuario.id_usuario;

    /* ¿Pide cambiar la rutina? Entonces Geko prepara una PROPUESTA (tarjeta con
       Aceptar / Rechazar). Si dijo que ya tiene algo de equipo, solo se actualiza
       la memoria del chat. */
    const peticion = RoutineChanges.detectarPeticion(mensaje);
    if (peticion.esCambio) {
      const gestion = await gestionarPedidoDeCambio(req, mensaje, peticion, estado, idUsuario);
      if (gestion.error) {
        return res.status(gestion.error.status).json({ ok: false, message: gestion.error.message });
      }

      estado.historial = [
        ...estado.historial,
        { role: 'user', content: mensaje },
        { role: 'assistant', content: gestion.texto },
      ];
      estado.ultimo = ahora;
      estado.total += 1;
      guardarEstado(req, estado);

      return res.json({ ok: true, respuesta: gestion.texto, fallback: false, propuesta: gestion.propuesta });
    }
    if (peticion.conEquipo.length) {
      estado.restricciones = RoutineChanges.fusionarRestricciones(estado.restricciones, peticion);
    }

    /* El router decide antes de leer: saludos o dudas generales de la app
       solo comprueban que exista el perfil, sin cargar sus datos. */
    const fuentes = seleccionarFuentes(mensaje, estado.historial);

    let perfil = {};
    if (fuentes.length) {
      perfil = await DashboardModel.getPerfil(idUsuario);
      if (!perfil) {
        return res.status(404).json({ ok: false, message: 'Completa tu perfil para que pueda ayudarte.' });
      }
    } else if (!(await ProfileModel.hasProfile(idUsuario))) {
      return res.status(404).json({ ok: false, message: 'Completa tu perfil para que pueda ayudarte.' });
    }

    const necesitaHistorial = fuentes.includes(FUENTES.HISTORIAL);
    const necesitaMetricas = fuentes.includes(FUENTES.METRICAS);
    const necesitaPlan = fuentes.includes(FUENTES.PERFIL);

    const [sesiones, mediciones, esPremium] = await Promise.all([
      necesitaHistorial
        ? DashboardModel.getSesiones(perfil.idCliente).catch((errSesiones) => {
            console.error('[geko-chat] no se pudieron leer las sesiones:', errSesiones.message);
            return [];
          })
        : Promise.resolve([]),
      necesitaMetricas
        ? ProgressModel.getMediciones(perfil.idCliente, 12).catch((errMediciones) => {
            console.error('[geko-chat] no se pudieron leer las mediciones:', errMediciones.message);
            return [];
          })
        : Promise.resolve([]),
      necesitaPlan ? tienePlanDePago(perfil.idCliente) : Promise.resolve(false),
    ]);

    const resumen = necesitaHistorial
      ? RoutineModel.calcularResumen(sesiones, perfil.dias, perfil.diasSemana)
      : {};

    /* Resumen de la rutina que la IA ya generó en esta sesión (si existe).
       Es solo texto de contexto: no se guarda ni se modifica nada. */
    const rutinaSesion = req.session.rutinaIA && req.session.rutinaIA.rutina;
    const nombres = (lista) =>
      (Array.isArray(lista) ? lista : [])
        .map((e) => String((e && e.nombre) || '').trim())
        .filter(Boolean)
        .slice(0, 10);
    const resumenRutina = rutinaSesion
      ? {
          calentamiento: nombres(rutinaSesion.calentamiento),
          principal: nombres(rutinaSesion.rutinaPrincipal),
          estiramiento: nombres(rutinaSesion.estiramiento),
          tiempoTotalMin: rutinaSesion.tiempoTotalMin,
        }
      : null;

    const { texto, fallback } = await responderChat({
      mensaje,
      historial: estado.historial,
      fuentes,
      contexto: {
        usuario: req.session.usuario,
        perfil,
        resumen,
        sesiones,
        mediciones,
        esPremium,
        pagina: req.body && req.body.pagina,
        rutina: resumenRutina,
      },
    });

    /* Historial corto en la sesión: solo los últimos turnos. */
    estado.historial = [
      ...estado.historial,
      { role: 'user', content: mensaje },
      { role: 'assistant', content: texto },
    ];
    estado.ultimo = ahora;
    estado.total += 1;
    guardarEstado(req, estado);

    return res.json({ ok: true, respuesta: texto, fallback });
  } catch (err) {
    console.error('[geko-chat] error al responder:', err.message);
    return res.status(500).json({
      ok: false,
      message: 'No pude responder ahora mismo. Inténtalo de nuevo en un momento.',
    });
  }
};

/**
 * POST /geko/chat/rutina/aceptar   body: { id }
 * Aplica la propuesta pendiente a la rutina de hoy. El navegador solo envía el
 * id: los ejercicios salen de la propuesta guardada en la sesión, así que no se
 * puede colar otro cambio. Solo se modifica la rutina (sesión + plan de IA).
 */
const aceptarCambio = async (req, res) => {
  try {
    const estado = leerEstado(req);
    const propuesta = estado.propuesta;
    const id = String((req.body && req.body.id) ?? '');

    if (!propuesta || propuesta.id !== id) {
      return res.status(409).json({ ok: false, message: 'Esa propuesta ya no está vigente. Pídeme el cambio otra vez.' });
    }
    if (Date.now() - (Number(propuesta.creadaEn) || 0) > VIGENCIA_PROPUESTA_MS) {
      estado.propuesta = null;
      guardarEstado(req, estado);
      return res.status(410).json({ ok: false, message: 'La propuesta caducó. Pídeme el cambio otra vez.' });
    }

    const cache = req.session.rutinaIA;
    if (!cache || !cache.rutina || cache.generadaEn !== propuesta.generadaEn) {
      estado.propuesta = null;
      guardarEstado(req, estado);
      return res.status(409).json({ ok: false, message: 'Tu rutina cambió desde que te hice la propuesta. Pídeme el cambio otra vez.' });
    }

    const { rutina, aplicados } = RoutineChanges.aplicarCambios(cache.rutina, propuesta.cambios);
    if (!aplicados.length) {
      estado.propuesta = null;
      guardarEstado(req, estado);
      return res.status(409).json({ ok: false, message: 'No pude aplicar el cambio porque tu rutina ya es distinta. Pídeme el cambio otra vez.' });
    }

    cache.rutina = rutina;

    /* Se guarda también en el plan de IA. Si la base falla, el usuario igual
       ve su rutina cambiada: solo se registra el error. */
    try {
      const perfil = await DashboardModel.getPerfil(req.session.usuario.id_usuario);
      if (perfil && perfil.idCliente) {
        await PlanEntrenamientoModel.guardarRutinaIA({
          idCliente: perfil.idCliente,
          rutina,
          nivelFisico: perfil.nivelFisico,
          fecha: RoutineModel.aFechaISO(new Date()),
          diaSemana: RoutineModel.DIAS_SEMANA[RoutineModel.indiceHoy()],
        });
      }
    } catch (errGuardado) {
      console.error('[geko-chat] no se pudo guardar la rutina modificada:', errGuardado.message);
    }

    const resumen = aplicados.map((c) => `${c.deNombre} por ${c.nuevo.nombre}`).join('; ');
    estado.propuesta = null;
    estado.historial = [...estado.historial, { role: 'assistant', content: `Cambio aplicado a la rutina: ${resumen}.` }];
    guardarEstado(req, estado);

    const mensaje =
      aplicados.length === 1
        ? 'Listo, cambié ese ejercicio en tu rutina. Lo verás en "Mi rutina".'
        : `Listo, cambié ${aplicados.length} ejercicios en tu rutina. Los verás en "Mi rutina".`;

    return res.json({
      ok: true,
      mensaje,
      aplicados: aplicados.map((c) => ({ de: c.deNombre, a: c.nuevo.nombre })),
    });
  } catch (err) {
    console.error('[geko-chat] error al aceptar el cambio:', err.message);
    return res.status(500).json({ ok: false, message: 'No pude aplicar el cambio. Inténtalo de nuevo.' });
  }
};

/** POST /geko/chat/rutina/rechazar   body: { id }  -> la rutina queda como estaba. */
const rechazarCambio = (req, res) => {
  try {
    const estado = leerEstado(req);
    const id = String((req.body && req.body.id) ?? '');

    if (estado.propuesta && estado.propuesta.id === id) {
      estado.propuesta = null;
      guardarEstado(req, estado);
    }
    return res.json({ ok: true, mensaje: 'Entendido, tu rutina se queda como estaba.' });
  } catch (err) {
    console.error('[geko-chat] error al rechazar el cambio:', err.message);
    return res.status(500).json({ ok: false, message: 'No pude descartar la propuesta.' });
  }
};

const reset = (req, res) => {
  try {
    if (req.session.gekoChat) delete req.session.gekoChat;
    return res.json({ ok: true });
  } catch (err) {
    console.error('[geko-chat] no se pudo reiniciar el chat:', err.message);
    return res.status(500).json({ ok: false });
  }
};

module.exports = { chat, reset, aceptarCambio, rechazarCambio };
