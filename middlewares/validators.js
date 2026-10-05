
const validateRegister = (req, res, next) => {
  const { nombre, apellido, nombre_usuario, correo, numero, contrasena } = req.body;

  if (!nombre || !apellido || !nombre_usuario || !correo || !numero || !contrasena) {
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

  next(); 
};

const validateLogin = (req, res, next) => {
  const { correo, contrasena } = req.body;

  if (!correo || !contrasena) {
    return res.status(400).json({ success: false, message: 'Completa correo y contraseña.' });
  }

  next();
};

const validateCompleteRegister = (req, res, next) => {
  const { apellido, nombre_usuario, numero } = req.body;

  if (!apellido || !nombre_usuario || !numero) {
    return res.status(400).json({ success: false, message: 'Completa todos los campos.' });
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

  next();
};

module.exports = { validateRegister, validateLogin, validateCompleteRegister };