const bcrypt = require('bcrypt');
const UserModel = require('../models/userModels');
const sso = require('../config/sso');
const { sendWelcomeEmail } = require('../config/welcomeMail');

const showLogin = (req, res) =>
  res.render('post/login', { providers: sso.enabledProviders() });

const showRegister = (req, res) => {
  res.render('post/register');
};

const showProfile = (req, res) => res.render('post/profile', { usuario: req.session.usuario });

const showTerminos = (req, res) => res.render('post/terms');

const showPrivacidad = (req, res) => res.render('post/politic');

const register = async (req, res) => {
  try {
    const { nombre, apellido, nombre_usuario, correo, numero, contrasena, acepta_terminos } = req.body;

    if (acepta_terminos !== true) {
      return res.status(400).json({ success: false, message: 'Debes aceptar los Términos y Condiciones.' });
    }
    if (await UserModel.existsByEmail(correo)) {
      return res.status(409).json({ success: false, message: 'Ese correo ya está registrado.' });
    }
    if (await UserModel.existsByUsername(nombre_usuario)) {
      return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está en uso.' });
    }
    if (await UserModel.existsByPhone(numero)) {
      return res.status(409).json({ success: false, message: 'Ese número ya está registrado.' });
    }

    const contrasena_hash = await bcrypt.hash(contrasena, 10);
    await UserModel.create({ nombre, apellido, nombre_usuario, correo, numero, contrasena_hash });

    // Sin await: el correo no retrasa ni bloquea el registro.
    sendWelcomeEmail({ to: correo, nombre, metodo: 'registro' });

    res.status(201).json({ success: true, message: 'Cuenta creada correctamente.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error del servidor.' });
  }
};

const login = async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    const usuario = await UserModel.findByEmail(correo);
    if (!usuario || !(await bcrypt.compare(contrasena, usuario.contrasena_hash))) {
      return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos.' });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error del servidor.' });
      }

      req.session.usuario = {
        id_usuario: usuario.id_usuario,
        id_rol: usuario.id_rol,
        nombre: usuario.nombre
      };

      res.json({ success: true, message: 'Inicio de sesión exitoso.' });
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error del servidor.' });
  }
};

const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('[logout] error al destruir la sesión:', err);
      return res.status(500).json({ success: false, message: 'No pudimos cerrar tu sesión.' });
    }

    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
};

const startSession = (req, res, user, destination) => {
  req.session.regenerate((err) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }

    req.session.usuario = {
      id_usuario: user.id_usuario,
      id_rol: user.id_rol,
      nombre: user.nombre
    };

    res.redirect(destination);
  });
};

module.exports = {
  showLogin,
  showRegister,
  showProfile,
  showTerminos,
  showPrivacidad,
  register,
  login,
  logout,
  startSession
};