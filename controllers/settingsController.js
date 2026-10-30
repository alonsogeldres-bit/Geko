/* ===========================================
   CONFIGURACIÓN
   Hub de ajustes de la cuenta: datos personales, perfil de
   entrenamiento, seguridad, apariencia y plan.
   Solo orquesta: los datos viven en los modelos y la
   presentación en las vistas EJS.
   =========================================== */
const bcrypt = require('bcrypt');
const UserModel = require('../models/userModels');
const ProfileModel = require('../models/profileModel');
const PlanModel = require('../models/planModel');

const MENSAJE_ERROR = 'No pudimos cargar tu configuración. Inténtalo de nuevo.';

/**
 * Plan efectivo del usuario. Si la BD falla, la página sigue funcionando
 * en modo Gratis (igual que hacía la vista anterior).
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
    console.error('[configuración] no se pudo resolver el plan:', err.message);
    return { nombre: 'Gratis', esDePago: false, fechaTermino: null };
  }
};

/** Contexto común de todas las vistas de configuración. */
const contexto = async (req) => {
  const idUsuario = req.session.usuario.id_usuario;
  const [cuenta, plan] = await Promise.all([
    UserModel.getAccountById(idUsuario),
    resolverPlan(idUsuario),
  ]);
  return { cuenta, plan, usuarioPremium: plan.esDePago };
};

/* ---------- GET /configuracion ---------- */

const showHub = async (req, res) => {
  try {
    const { cuenta, plan, usuarioPremium } = await contexto(req);
    res.render('configuracion/index', { cuenta, plan, usuarioPremium });
  } catch (err) {
    console.error('[configuración] error al cargar el hub:', err.message);
    res.status(500).send(MENSAJE_ERROR);
  }
};

/* ---------- GET/POST /configuracion/datos ---------- */

const showDatos = async (req, res) => {
  try {
    const { cuenta, usuarioPremium } = await contexto(req);
    if (!cuenta) return res.redirect('/login');
    res.render('configuracion/datos', { cuenta, usuarioPremium });
  } catch (err) {
    console.error('[configuración] error al cargar los datos:', err.message);
    res.status(500).send(MENSAJE_ERROR);
  }
};

const updateDatos = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    const cuenta = await UserModel.getAccountById(idUsuario);
    if (!cuenta) {
      return res.status(404).json({ success: false, message: 'No encontramos tu cuenta.' });
    }

    const datos = { ...req.accountData };

    // Las cuentas de Google no pueden cambiar el correo desde aquí:
    // es el identificador con el que el proveedor las reconoce.
    if (cuenta.usuario_proveedor !== 'local') datos.correo = cuenta.correo;

    if (datos.correo !== cuenta.correo && await UserModel.existsByEmailExcept(datos.correo, idUsuario)) {
      return res.status(409).json({ success: false, message: 'Ese correo ya está registrado.' });
    }
    if (datos.nombre_usuario !== cuenta.nombre_usuario && await UserModel.existsByUsernameExcept(datos.nombre_usuario, idUsuario)) {
      return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está en uso.' });
    }
    if (datos.numero !== cuenta.numero && await UserModel.existsByPhoneExcept(datos.numero, idUsuario)) {
      return res.status(409).json({ success: false, message: 'Ese número ya está registrado.' });
    }

    await UserModel.updateAccount(idUsuario, datos);

    // La sesión guarda el nombre para el saludo del dashboard: se refresca aquí.
    req.session.usuario.nombre = datos.nombre;

    return res.json({
      success: true,
      message: 'Datos actualizados correctamente.',
      redirect: '/configuracion/datos',
    });
  } catch (err) {
    console.error('[configuración] error al guardar los datos:', err.message);
    return res.status(500).json({ success: false, message: 'No pudimos guardar tus datos. Inténtalo de nuevo.' });
  }
};

/* ---------- GET/POST /configuracion/seguridad ---------- */

const showSeguridad = async (req, res) => {
  try {
    const { cuenta, usuarioPremium } = await contexto(req);
    if (!cuenta) return res.redirect('/login');
    res.render('configuracion/seguridad', {
      cuenta,
      usuarioPremium,
      esLocal: cuenta.usuario_proveedor === 'local',
    });
  } catch (err) {
    console.error('[configuración] error al cargar seguridad:', err.message);
    res.status(500).send(MENSAJE_ERROR);
  }
};

const updatePassword = async (req, res) => {
  try {
    const idUsuario = req.session.usuario.id_usuario;
    const cuenta = await UserModel.findById(idUsuario);
    if (!cuenta) {
      return res.status(404).json({ success: false, message: 'No encontramos tu cuenta.' });
    }

    if (cuenta.usuario_proveedor !== 'local') {
      return res.status(400).json({
        success: false,
        message: 'Tu cuenta se creó con Google. Cambia la contraseña desde tu cuenta de Google.',
      });
    }

    const coincide = await bcrypt.compare(req.passwordData.actual, cuenta.contrasena_hash);
    if (!coincide) {
      return res.status(400).json({ success: false, message: 'La contraseña actual no es correcta.' });
    }

    const contrasena_hash = await bcrypt.hash(req.passwordData.nueva, 10);
    await UserModel.updatePassword(idUsuario, contrasena_hash);

    return res.json({ success: true, message: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    console.error('[configuración] error al cambiar la contraseña:', err.message);
    return res.status(500).json({ success: false, message: 'No pudimos cambiar tu contraseña. Inténtalo de nuevo.' });
  }
};

/* ---------- GET /configuracion/entrenamiento ---------- */

// Mismo contenido que la antigua /configuracion: el perfil que usa el
// generador de rutinas. Sin fila en clientes no hay nada que editar.
const showEntrenamiento = async (req, res) => {
  try {
    const { usuarioPremium } = await contexto(req);
    const perfil = await ProfileModel.getProfileByUser(req.session.usuario.id_usuario);

    if (!perfil) return res.redirect('/profile');

    res.render('configuracion/entrenamiento', { perfil, usuarioPremium });
  } catch (err) {
    console.error('[configuración] error al cargar el perfil:', err.message);
    res.status(500).send(MENSAJE_ERROR);
  }
};

/* ---------- GET /configuracion/cuenta ---------- */

const showCuenta = async (req, res) => {
  try {
    const { cuenta, plan, usuarioPremium } = await contexto(req);
    if (!cuenta) return res.redirect('/login');
    res.render('configuracion/cuenta', { cuenta, plan, usuarioPremium });
  } catch (err) {
    console.error('[configuración] error al cargar la cuenta:', err.message);
    res.status(500).send(MENSAJE_ERROR);
  }
};

module.exports = {
  showHub,
  showDatos,
  updateDatos,
  showSeguridad,
  updatePassword,
  showEntrenamiento,
  showCuenta,
};
