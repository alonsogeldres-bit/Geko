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

/** Fecha de cirugía YYYY-MM-DD: debe existir y no ser futura. Devuelve mensaje o null. */
const validarFechaCirugia = (valor) => {
  const MSG = 'La fecha de la cirugía no es válida.';
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return MSG;

  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return MSG;

  // +1 día de margen por diferencias de zona horaria entre navegador y servidor
  const hoy = new Date();
  const limite = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + 1);
  if (fecha.getTime() > limite) return 'La fecha de la cirugía no puede ser futura.';
  if (anio < 1900) return MSG;
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

const validateProfile = (req, res, next) => {
  const P = require('../models/profileModel');
  const b = req.body || {};
  const fail = (message) => res.status(400).json({ success: false, message });
  const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

  const heightCm = Number(b.heightCm);
  if (!Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) {
    return fail('La altura debe estar entre 100 y 250 cm.');
  }

  const weightKg = Number(b.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300) {
    return fail('El peso debe estar entre 30 y 300 kg.');
  }

  if (!Object.prototype.hasOwnProperty.call(P.SEX, b.sex)) return fail('Sexo no válido.');
  if (!Object.prototype.hasOwnProperty.call(P.LEVELS, b.level)) return fail('Nivel no válido.');
  if (!Object.prototype.hasOwnProperty.call(P.ENVIRONMENTS, b.environment)) return fail('Entorno no válido.');

  if (!isStringArray(b.goals) || b.goals.length === 0 || !b.goals.every((g) => Object.prototype.hasOwnProperty.call(P.GOALS, g))) {
    return fail('Selecciona al menos un objetivo válido.');
  }

  if (!isStringArray(b.injuries) || !b.injuries.every((i) => i === 'Ninguna' || P.INJURIES.includes(i))) {
    return fail('Las limitaciones seleccionadas no son válidas.');
  }

  if (!isStringArray(b.equipment) || !b.equipment.every((e) => e === 'Ninguno' || P.EQUIPMENT.includes(e))) {
    return fail('El equipamiento seleccionado no es válido.');
  }
  if (b.equipment.length === 0) return fail('Selecciona el equipamiento.');

  // Días de entrenamiento: ahora son días concretos (ej. ['Lunes', 'Jueves'])
  if (!isStringArray(b.days) || b.days.length === 0 || !b.days.every((d) => P.DAYS.includes(d))) {
    return fail('Selecciona al menos un día de entrenamiento válido.');
  }
  // Sin repetidos y en orden de semana
  const days = P.DAYS.filter((d) => b.days.includes(d));

  const minutesPerSession = Number(b.minutesPerSession);
  if (!P.MINUTES_ALLOWED.includes(minutesPerSession)) return fail('Los minutos por sesión no son válidos.');

  const injuriesText = typeof b.injuriesText === 'string' ? b.injuriesText.trim() : '';
  if (injuriesText.length > 250) return fail('La descripción no puede superar los 250 caracteres.');

  // Cirugías (opcional): máximo 10, cada una con descripción
  const rawSurgeries = b.surgeries === undefined ? [] : b.surgeries;
  if (!Array.isArray(rawSurgeries) || rawSurgeries.length > 10) {
    return fail('Puedes registrar hasta 10 cirugías.');
  }
  const surgeries = [];
  for (const sg of rawSurgeries) {
    if (!sg || typeof sg !== 'object') return fail('Una cirugía no es válida.');
    const descripcion = typeof sg.descripcion === 'string' ? sg.descripcion.trim() : '';
    const fecha = typeof sg.fecha === 'string' ? sg.fecha.trim() : '';
    const observaciones = typeof sg.observaciones === 'string' ? sg.observaciones.trim() : '';

    if (!descripcion) return fail('Describe cada cirugía.');
    if (descripcion.length > 255) return fail('La descripción de la cirugía no puede superar los 255 caracteres.');
    if (observaciones.length > 500) return fail('Las observaciones no pueden superar los 500 caracteres.');
    if (fecha) {
      const errorFecha = validarFechaCirugia(fecha);
      if (errorFecha) return fail(errorFecha);
    }
    surgeries.push({ descripcion, fecha: fecha || null, observaciones: observaciones || null });
  }

  req.profileData = {
    heightCm,
    weightKg,
    sex: b.sex,
    level: b.level,
    environment: b.environment,
    goals: [...new Set(b.goals)],
    injuries: [...new Set(b.injuries.filter((i) => i !== 'Ninguna'))],
    equipment: [...new Set(b.equipment.filter((e) => e !== 'Ninguno'))],
    days,
    daysPerWeek: days.length, // compatibilidad con dashboard / generador de rutina
    minutesPerSession,
    injuriesText,
    surgeries,
  };

  next();
};

const validateAccountUpdate = (req, res, next) => {
  const b = req.body || {};
  const fail = (message) => res.status(400).json({ success: false, message });

  const nombre = typeof b.nombre === 'string' ? b.nombre.trim() : '';
  const apellido = typeof b.apellido === 'string' ? b.apellido.trim() : '';
  const nombre_usuario = typeof b.nombre_usuario === 'string' ? b.nombre_usuario.trim() : '';
  const correo = typeof b.correo === 'string' ? b.correo.trim().toLowerCase() : '';
  const numero = typeof b.numero === 'string' ? b.numero.trim() : '';
  const fecha_nacimiento = typeof b.fecha_nacimiento === 'string' ? b.fecha_nacimiento.trim() : '';

  if (!nombre || !apellido || !nombre_usuario || !correo || !numero || !fecha_nacimiento) {
    return fail('Completa todos los campos.');
  }

  if (nombre.length < 2 || nombre.length > 50) {
    return fail('El nombre debe tener entre 2 y 50 caracteres.');
  }

  if (apellido.length > 50) {
    return fail('El apellido no puede superar los 50 caracteres.');
  }

  if (nombre_usuario.length < 3 || nombre_usuario.length > 50) {
    return fail('El nombre de usuario debe tener entre 3 y 50 caracteres.');
  }

  if (correo.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return fail('El correo no tiene un formato válido.');
  }

  if (!/^[\d\s+]{8,20}$/.test(numero)) {
    return fail('El número de teléfono no es válido.');
  }

  const errorFecha = validarFechaNacimiento(fecha_nacimiento);
  if (errorFecha) return fail(errorFecha);

  req.accountData = { nombre, apellido, nombre_usuario, correo, numero, fecha_nacimiento };
  next();
};

const validatePasswordChange = (req, res, next) => {
  const b = req.body || {};
  const fail = (message) => res.status(400).json({ success: false, message });

  const actual = typeof b.actual === 'string' ? b.actual : '';
  const nueva = typeof b.nueva === 'string' ? b.nueva : '';
  const confirmacion = typeof b.confirmacion === 'string' ? b.confirmacion : '';

  if (!actual || !nueva || !confirmacion) {
    return fail('Completa todos los campos.');
  }

  if (nueva.length < 6) {
    return fail('La contraseña debe tener al menos 6 caracteres.');
  }

  // 72 bytes es el límite real de bcrypt: más allá se ignora el resto.
  if (nueva.length > 72) {
    return fail('La contraseña no puede superar los 72 caracteres.');
  }

  if (nueva !== confirmacion) {
    return fail('Las contraseñas no coinciden.');
  }

  if (nueva === actual) {
    return fail('La nueva contraseña debe ser distinta a la actual.');
  }

  req.passwordData = { actual, nueva };
  next();
};

module.exports = {
  validateRegister,
  validateLogin,
  validateCompleteRegistration,
  validateForgotPassword,
  validateResetPassword,
  validateProfile,
  validateAccountUpdate,
  validatePasswordChange,
};