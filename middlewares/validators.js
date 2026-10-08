/**
 * Valida una fecha de nacimiento en formato YYYY-MM-DD (el que envía <input type="date">).
 * Devuelve un mensaje de error, o null si es válida.
 */
const validarFechaNacimiento = (valor) => {
  const MSG_INVALIDA = 'Ingresa una fecha de nacimiento válida.';

  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return MSG_INVALIDA;
  }

  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));

  // Descarta fechas inexistentes como 2024-02-31.
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) {
    return MSG_INVALIDA;
  }

  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate());

  if (fecha.getTime() > hoyUTC) {
    return 'La fecha de nacimiento no puede ser futura.';
  }
  if (anio < hoy.getUTCFullYear() - 120) {
    return MSG_INVALIDA;
  }

  return null;
};

const validateRegister = (req, res, next) => {
  const { nombre, apellido, nombre_usuario, correo, numero, contrasena, fecha_nacimiento } = req.body;

  if (!nombre || !apellido || !nombre_usuario || !correo || !numero || !contrasena || !fecha_nacimiento) {
    return res.status(400).json({ success: false, message: 'Completa todos los campos.' });
  }

  const correoRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!correoRegex.test(correo)) {
    return res.status(400).json({ success: false, message: 'El correo no tiene un formato válido.' });
  }

  const numeroRegex = /^[\d\s+]{8,20}$/;
  if (!numeroRegex.test(numero)) {
    return res.status(400).json({ success: false, message: 'El número de teléfono no es válido.' });
  }

  if (contrasena.length < 6) {
    return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  if (nombre_usuario.length < 3 || nombre_usuario.length > 50) {
    return res.status(400).json({ success: false, message: 'El nombre de usuario debe tener entre 3 y 50 caracteres.' });
  }

  const errorFecha = validarFechaNacimiento(fecha_nacimiento);
  if (errorFecha) {
    return res.status(400).json({ success: false, message: errorFecha });
  }

  next(); 
};

const validateLogin = (req, res, next) => {
  const { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json({ success: false, message: 'Completa correo y contraseña.' });
  }

  next();
};

const validateCompleteRegistration = (req, res, next) => {
  const { nombre, apellido, nombre_usuario, numero, fecha_nacimiento } = req.body;

  if (!nombre || !apellido || !nombre_usuario || !numero || !fecha_nacimiento) {
    return res.status(400).json({ success: false, message: 'Completa todos los campos.' });
  }

  if (nombre.trim().length < 2 || nombre.trim().length > 50) {
    return res.status(400).json({ success: false, message: 'El nombre debe tener entre 2 y 50 caracteres.' });
  }

  const numeroRegex = /^[\d\s+]{8,20}$/;
  if (!numeroRegex.test(numero)) {
    return res.status(400).json({ success: false, message: 'El número de teléfono no es válido.' });
  }

  if (nombre_usuario.length < 3 || nombre_usuario.length > 50) {
    return res.status(400).json({ success: false, message: 'El nombre de usuario debe tener entre 3 y 50 caracteres.' });
  }

  if (apellido.length > 50) {
    return res.status(400).json({ success: false, message: 'El apellido no puede superar los 50 caracteres.' });
  }

  const errorFecha = validarFechaNacimiento(fecha_nacimiento);
  if (errorFecha) {
    return res.status(400).json({ success: false, message: errorFecha });
  }

  next();
};

const validateForgotPassword = (req, res, next) => {
  const { correo } = req.body;

  if (!correo) {
    return res.status(400).json({ success: false, message: 'Ingresa tu correo electrónico.' });
  }

  const correoRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!correoRegex.test(correo)) {
    return res.status(400).json({ success: false, message: 'El correo no tiene un formato válido.' });
  }

  next();
};

const validateResetPassword = (req, res, next) => {
  const { contrasena, confirmacion } = req.body;

  if (!contrasena || !confirmacion) {
    return res.status(400).json({ success: false, message: 'Completa ambos campos.' });
  }

  if (contrasena.length < 6) {
    return res.status(400).json({ success: false, message: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  if (contrasena.length > 10) {
    return res.status(400).json({ success: false, message: 'La contraseña no puede superar los 10 caracteres.' });
  }

  if (contrasena !== confirmacion) {
    return res.status(400).json({ success: false, message: 'Las contraseñas no coinciden.' });
  }

  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateCompleteRegistration,
  validateForgotPassword,
  validateResetPassword,
};