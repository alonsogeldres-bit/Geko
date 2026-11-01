/* ===========================================
   CHAT DE LA MASCOTA GEKO
   POST /geko/chat        -> responde una pregunta (solo lectura)
   POST /geko/chat/reset  -> olvida la conversación de esta sesión

   No escribe en la base de datos: lee el perfil y el resumen con las mismas
   funciones del dashboard solo para dar contexto a la IA.
   =========================================== */

const DashboardModel = require('../models/dashboardModel');
const RoutineModel = require('../models/routineModel');
const PlanModel = require('../models/planModel');
const { responderChat, MAX_HISTORIAL, MAX_MENSAJE_USUARIO } = require('../services/gekoChatService');

const MAX_MENSAJES_POR_SESION = 40;  // preguntas del usuario en toda la sesión
const COOLDOWN_MS = 1200;            // evita dobles envíos seguidos

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
    return { historial: [], ultimo: 0, total: 0 };
  }
  return {
    historial: Array.isArray(actual.historial) ? actual.historial : [],
    ultimo: Number(actual.ultimo) || 0,
    total: Number(actual.total) || 0,
  };
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
    const perfil = await DashboardModel.getPerfil(idUsuario);

    if (!perfil) {
      return res.status(404).json({ ok: false, message: 'Completa tu perfil para que pueda ayudarte.' });
    }

    let sesiones = [];
    try {
      sesiones = await DashboardModel.getSesiones(perfil.idCliente);
    } catch (errSesiones) {
      console.error('[geko-chat] no se pudieron leer las sesiones:', errSesiones.message);
    }

    const resumen = RoutineModel.calcularResumen(sesiones, perfil.dias, perfil.diasSemana);
    const esPremium = await tienePlanDePago(perfil.idCliente);

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
      contexto: {
        usuario: req.session.usuario,
        perfil,
        resumen,
        esPremium,
        pagina: req.body && req.body.pagina,
        rutina: resumenRutina,
      },
    });

    /* Historial corto en la sesión: solo los últimos turnos. */
    const historial = [
      ...estado.historial,
      { role: 'user', content: mensaje },
      { role: 'assistant', content: texto },
    ].slice(-MAX_HISTORIAL);

    req.session.gekoChat = {
      historial,
      ultimo: ahora,
      total: estado.total + 1,
    };

    return res.json({ ok: true, respuesta: texto, fallback });
  } catch (err) {
    console.error('[geko-chat] error al responder:', err.message);
    return res.status(500).json({
      ok: false,
      message: 'No pude responder ahora mismo. Inténtalo de nuevo en un momento.',
    });
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

module.exports = { chat, reset };
