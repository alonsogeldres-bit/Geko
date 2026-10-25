const bcrypt = require('bcrypt');
const AdminModel = require('../models/adminModel');
const UserModel = require('../models/userModels');
const mailer = require('../config/mailer');
const recovery = require('../config/recovery');

const { ID_ROL_ADMIN, ID_ROL_CLIENTE, ID_ROL_SUPERADMIN } = UserModel;

const actorDe = (req) => {
  const u = req.session.usuario;
  return { id_usuario: u.id_usuario, rol: u.id_rol === ID_ROL_SUPERADMIN ? 'superadmin' : 'admin' };
};

const log = (req, accion, entidad, idEntidad, detalle) =>
  AdminModel.registrar({ actor: actorDe(req), accion, entidad, idEntidad, detalle, ip: req.ip });

const volver = (req, res, tipo, msg, destino) => {
  req.session.flash = { tipo, msg };
  req.session.save(() => res.redirect(destino));
};

/** Admin gestiona clientes; solo el super admin gestiona admins. Nadie toca al super admin ni a sí mismo. */
const puedeGestionar = (req, target) => {
  const actor = req.session.usuario;
  if (!target || target.id_rol === ID_ROL_SUPERADMIN) return false;
  if (target.id_usuario === actor.id_usuario) return false;
  if (target.id_rol === ID_ROL_ADMIN) return actor.id_rol === ID_ROL_SUPERADMIN;
  return true;
};

/** Reautenticación: acciones críticas piden la contraseña de quien las ejecuta. */
const verificarContrasena = async (req) => {
  const clave = String(req.body.contrasena_actual || '');
  if (!clave) return false;
  const yo = await UserModel.findById(req.session.usuario.id_usuario);
  return Boolean(yo && yo.usuario_proveedor === 'local' && (await bcrypt.compare(clave, yo.contrasena_hash)));
};

const cargarObjetivo = async (req) => AdminModel.getUser(Number(req.params.id));

const fmt = (d) => (d ? new Date(d).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—');
const fmtDia = (d) => (d ? new Date(d).toLocaleDateString('es-CL') : '—');

/* ---------- Vistas ---------- */

const dashboard = async (req, res) => {
  try {
    const [stats, auditoria] = await Promise.all([AdminModel.getStats(), AdminModel.listAuditoria(1, 8)]);
    res.render('admin/admin', { titulo: 'Resumen', nav: 'resumen', stats, eventos: auditoria.rows, fmt });
  } catch (err) {
    console.error('[admin] dashboard:', err.message);
    res.status(500).send('No pudimos cargar el panel.');
  }
};

const listaUsuarios = async (req, res) => {
  try {
    const filtros = {
      q: String(req.query.q || '').trim().slice(0, 60),
      rol: String(req.query.rol || ''),
      estado: String(req.query.estado || ''),
      page: Math.max(1, parseInt(req.query.page, 10) || 1),
    };
    const data = await AdminModel.listUsers(filtros);
    res.render('admin/usuarios', { titulo: 'Usuarios', nav: 'usuarios', filtros, ...data });
  } catch (err) {
    console.error('[admin] usuarios:', err.message);
    res.status(500).send('No pudimos cargar los usuarios.');
  }
};

const detalleUsuario = async (req, res) => {
  try {
    const target = await cargarObjetivo(req);
    if (!target) return res.status(404).send('Usuario no encontrado.');
    res.render('admin/usuario', {
      titulo: `${target.nombre} ${target.apellido}`, nav: 'usuarios',
      target, gestionable: puedeGestionar(req, target), fmt, fmtDia,
    });
  } catch (err) {
    console.error('[admin] detalle:', err.message);
    res.status(500).send('No pudimos cargar el usuario.');
  }
};

const auditoria = async (req, res) => {
  try {
    const data = await AdminModel.listAuditoria(Math.max(1, parseInt(req.query.page, 10) || 1));
    res.render('admin/auditoria', { titulo: 'Auditoría', nav: 'auditoria', ...data, fmt });
  } catch (err) {
    console.error('[admin] auditoría:', err.message);
    res.status(500).send('No pudimos cargar la auditoría.');
  }
};

/* ---------- Acciones sobre usuarios ---------- */

const cambiarEstado = async (req, res) => {
  const back = `/admin/usuarios/${req.params.id}`;
  try {
    const target = await cargarObjetivo(req);
    if (!puedeGestionar(req, target) || target.estado === 'Eliminado') {
      return volver(req, res, 'error', 'No tienes permiso para esa acción.', back);
    }
    const nuevo = target.estado === 'Bloqueado' ? 'Activo' : 'Bloqueado';
    await AdminModel.setEstado(target.id_usuario, nuevo);
    await log(req, nuevo === 'Bloqueado' ? 'usuario_bloqueado' : 'usuario_desbloqueado', 'usuarios', target.id_usuario, target.correo);
    volver(req, res, 'ok', nuevo === 'Bloqueado' ? 'Cuenta bloqueada.' : 'Cuenta desbloqueada.', back);
  } catch (err) {
    console.error('[admin] estado:', err.message);
    volver(req, res, 'error', 'No pudimos cambiar el estado.', back);
  }
};

const eliminar = async (req, res) => {
  const back = `/admin/usuarios/${req.params.id}`;
  try {
    const target = await cargarObjetivo(req);
    if (!puedeGestionar(req, target) || target.estado === 'Eliminado') {
      return volver(req, res, 'error', 'No tienes permiso para esa acción.', back);
    }
    if (!(await verificarContrasena(req))) {
      return volver(req, res, 'error', 'Contraseña incorrecta. No se eliminó la cuenta.', back);
    }
    await AdminModel.setEstado(target.id_usuario, 'Eliminado');
    await log(req, target.id_rol === ID_ROL_ADMIN ? 'admin_eliminado' : 'usuario_eliminado', 'usuarios', target.id_usuario, target.correo);
    volver(req, res, 'ok', 'Cuenta eliminada (borrado lógico).', '/admin/usuarios');
  } catch (err) {
    console.error('[admin] eliminar:', err.message);
    volver(req, res, 'error', 'No pudimos eliminar la cuenta.', back);
  }
};

const premium = async (req, res) => {
  const back = `/admin/usuarios/${req.params.id}`;
  try {
    const target = await cargarObjetivo(req);
    if (!puedeGestionar(req, target)) return volver(req, res, 'error', 'No tienes permiso para esa acción.', back);
    if (!target.id_cliente) return volver(req, res, 'error', 'El usuario aún no completó su perfil.', back);

    if (req.body.accion === 'cancelar') {
      const n = await AdminModel.cancelPremium(target.id_cliente);
      await log(req, 'premium_cancelado', 'clientes', target.id_cliente, target.correo);
      return volver(req, res, n ? 'ok' : 'error', n ? 'Premium cancelado.' : 'No tenía Premium vigente.', back);
    }
    const dias = Math.min(365, Math.max(1, parseInt(req.body.dias, 10) || 30));
    await AdminModel.grantPremium(target.id_cliente, dias);
    await log(req, 'premium_otorgado', 'clientes', target.id_cliente, `${target.correo} · ${dias} días`);
    volver(req, res, 'ok', `Premium activado por ${dias} días.`, back);
  } catch (err) {
    console.error('[admin] premium:', err.message);
    volver(req, res, 'error', 'No pudimos actualizar el plan.', back);
  }
};

const resetPassword = async (req, res) => {
  const back = `/admin/usuarios/${req.params.id}`;
  try {
    const target = await cargarObjetivo(req);
    if (!puedeGestionar(req, target)) return volver(req, res, 'error', 'No tienes permiso para esa acción.', back);
    if (target.usuario_proveedor !== 'local') return volver(req, res, 'error', 'La cuenta usa Google: no tiene contraseña.', back);
    if (!mailer.isMailConfigured()) return volver(req, res, 'error', 'El envío de correos no está disponible.', back);

    const full = await UserModel.findById(target.id_usuario);
    const url = recovery.buildResetUrl(recovery.createToken(full.id_usuario, full.contrasena_hash));
    await mailer.sendMail({
      to: full.correo,
      subject: 'Restablece tu contraseña de GEKO',
      text: `Hola,\n\nUn administrador envió este enlace para que crees una nueva contraseña:\n\n${url}\n\nVence en ${recovery.TTL_MINUTES} minutos y solo puede usarse una vez.`,
      html: `<p>Hola,</p><p>Un administrador envió este enlace para que crees una nueva contraseña:</p><p><a href="${url}">Crear nueva contraseña</a></p><p style="color:#666">Vence en ${recovery.TTL_MINUTES} minutos y solo puede usarse una vez.</p>`,
    });
    await log(req, 'reset_password_enviado', 'usuarios', target.id_usuario, target.correo);
    volver(req, res, 'ok', 'Enlace de restablecimiento enviado por correo.', back);
  } catch (err) {
    console.error('[admin] reset:', err.message);
    volver(req, res, 'error', 'No pudimos enviar el correo.', back);
  }
};

/* ---------- Solo super admin ---------- */

const cambiarRol = async (req, res) => {
  const back = `/admin/usuarios/${req.params.id}`;
  try {
    const target = await cargarObjetivo(req);
    const nuevoRol = Number(req.body.id_rol);
    if (!puedeGestionar(req, target) || ![ID_ROL_ADMIN, ID_ROL_CLIENTE].includes(nuevoRol) || target.estado === 'Eliminado') {
      return volver(req, res, 'error', 'No tienes permiso para esa acción.', back);
    }
    if (nuevoRol === target.id_rol) return volver(req, res, 'error', 'El usuario ya tiene ese rol.', back);
    if (!(await verificarContrasena(req))) return volver(req, res, 'error', 'Contraseña incorrecta. El rol no cambió.', back);

    await AdminModel.setRol(target.id_usuario, nuevoRol);
    await log(req, nuevoRol === ID_ROL_ADMIN ? 'rol_ascendido_admin' : 'rol_degradado_cliente', 'usuarios', target.id_usuario, target.correo);
    volver(req, res, 'ok', 'Rol actualizado. Se aplica de inmediato.', back);
  } catch (err) {
    console.error('[admin] rol:', err.message);
    volver(req, res, 'error', 'No pudimos cambiar el rol.', back);
  }
};

const formNuevoAdmin = (req, res) =>
  res.render('admin/newAdmin', { titulo: 'Nuevo admin', nav: 'nuevo', datos: {} });

const crearAdmin = async (req, res) => {
  const datos = {
    nombre: String(req.body.nombre || '').trim(),
    apellido: String(req.body.apellido || '').trim(),
    correo: String(req.body.correo || '').trim().toLowerCase(),
    numero: String(req.body.numero || '').trim(),
    nombre_usuario: String(req.body.nombre_usuario || '').trim(),
  };
  const contrasena = String(req.body.contrasena || '');
  const error = (msg) => res.status(400).render('admin/newAdmin', {
    titulo: 'Nuevo admin', nav: 'nuevo', datos, flash: { tipo: 'error', msg },
  });

  try {
    if (Object.values(datos).some((v) => !v)) return error('Completa todos los campos.');
    if (datos.nombre.length > 50 || datos.apellido.length > 50 || datos.nombre_usuario.length > 50 || datos.numero.length > 20) {
      return error('Alguno de los campos es demasiado largo.');
    }
    if (!/^\S+@\S+\.\S+$/.test(datos.correo) || datos.correo.length > 100) return error('El correo no es válido.');
    if (contrasena.length < 8) return error('La contraseña debe tener al menos 8 caracteres.');
    if (!(await verificarContrasena(req))) return error('Tu contraseña actual es incorrecta.');

    const duplicado = await AdminModel.existeDuplicado(datos);
    if (duplicado) return error(duplicado);

    const id = await AdminModel.createAdmin({
      ...datos, contrasena_hash: await bcrypt.hash(contrasena, 10), idRol: ID_ROL_ADMIN,
    });
    await log(req, 'admin_creado', 'usuarios', id, datos.correo);
    volver(req, res, 'ok', 'Administrador creado.', `/admin/usuarios/${id}`);
  } catch (err) {
    console.error('[admin] crear admin:', err.message);
    error('No pudimos crear el administrador.');
  }
};

module.exports = {
  dashboard, listaUsuarios, detalleUsuario, auditoria,
  cambiarEstado, eliminar, premium, resetPassword,
  cambiarRol, formNuevoAdmin, crearAdmin,
};