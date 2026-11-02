/* ===========================================
   AYUDA
   Centro de ayuda de la cuenta: preguntas frecuentes,
   comparación Gratis / Premium, contacto y redes sociales.
   Solo orquesta: el plan se resuelve con PlanModel y la
   presentación vive en views/post/ayuda.ejs.
   =========================================== */
const PlanModel = require('../models/planModel');
const UserModel = require('../models/userModels');

const CORREO_SOPORTE = 'geko.training@gmail.com';

/**
 * Plan efectivo del usuario. Si la BD falla, la página sigue disponible
 * mostrando el plan Gratis (igual que el resto de vistas de cuenta).
 */
const resolverPlan = async (idUsuario) => {
  try {
    const idCliente = await PlanModel.getClienteByUser(idUsuario);
    if (!idCliente) return { nombre: 'Gratis', esDePago: false, fechaTermino: null };

    const plan = await PlanModel.getEffectivePlan(idCliente);
    const suscripcion = plan.esDePago ? await PlanModel.getActiveSubscription(idCliente) : null;

    return {
      nombre: plan.nombre,
      esDePago: plan.esDePago,
      fechaTermino: suscripcion ? suscripcion.fechaTermino : null,
    };
  } catch (err) {
    console.error('[ayuda] no se pudo resolver el plan:', err.message);
    return { nombre: 'Gratis', esDePago: false, fechaTermino: null };
  }
};

/**
 * Enlace al redactor web de Gmail.
 *
 * No se usa mailto: porque el sistema operativo lo entrega al cliente de
 * correo predeterminado (por ejemplo Outlook). Con esta URL el correo se
 * abre en el navegador, que es lo que buscamos.
 */
const construirEnlaceCorreo = (cuenta, plan) => {
  const asunto = 'Ayuda con GEKO';
  const cuerpo = [
    'Hola equipo de GEKO,',
    '',
    'Necesito ayuda con:',
    '',
    'Mi cuenta: ' + (cuenta && cuenta.correo ? cuenta.correo : ''),
    'Plan actual: ' + plan.nombre,
    '',
    'Gracias.',
  ].join('\n');

  return 'https://mail.google.com/mail/?view=cm&fs=1' +
    '&to=' + encodeURIComponent(CORREO_SOPORTE) +
    '&su=' + encodeURIComponent(asunto) +
    '&body=' + encodeURIComponent(cuerpo);
};

/* ---------- GET /ayuda ---------- */
const showAyuda = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;

    const [cuenta, plan] = await Promise.all([
      UserModel.getAccountById(idUsuario).catch((err) => {
        console.error('[ayuda] no se pudo cargar la cuenta:', err.message);
        return null;
      }),
      resolverPlan(idUsuario),
    ]);

    res.render('post/ayuda', {
      usuario: req.session.usuario,
      cuenta,
      plan,
      usuarioPremium: plan.esDePago,
      contacto: CORREO_SOPORTE,
      correoUrl: construirEnlaceCorreo(cuenta, plan),
    });
  } catch (err) {
    console.error('[ayuda] error al cargar el centro de ayuda:', err.message);
    res.status(500).send('No pudimos cargar el centro de ayuda. Inténtalo de nuevo.');
  }
};

module.exports = { showAyuda };
