const bcrypt = require('bcrypt');
const UserModel = require('../models/userModels');
const { ID_ROL_ADMIN, ID_ROL_SUPERADMIN } = UserModel;
const ProfileModel = require('../models/profileModel');
const sso = require('../config/sso');
const { sendWelcomeEmail } = require('../config/welcomeMail');

const showLogin = (req, res) =>
  res.render('post/login', { providers: sso.enabledProviders() });

const showRegister = (req, res) => {
  res.render('post/register');
};

const showProfile = async (req, res) => {
  try {
    // ?edit=1 fuerza el wizard aunque el perfil ya exista (menú "Mi perfil").
    if (req.query.edit === undefined) {
      const idCliente = await ProfileModel.hasProfile(req.session.usuario.id_usuario);
      if (idCliente) return res.redirect('/dashboard');
    }
    res.render('post/profile', { usuario: req.session.usuario });
  } catch (err) {
    // Si falla la consulta no bloqueamos al usuario: mostramos el wizard.
    console.error('[profile] error al verificar el perfil:', err.message);
    res.render('post/profile', { usuario: req.session.usuario });
  }
};

const showTerminos = (req, res) => res.render('post/terms');

const showPrivacidad = (req, res) => res.render('post/politic');

const register = async (req, res) => {
  try {
    const { nombre, apellido, nombre_usuario, correo, numero, contrasena, acepta_terminos, fecha_nacimiento } = req.body;

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
    await UserModel.create({ nombre, apellido, nombre_usuario, correo, numero, contrasena_hash, fecha_nacimiento });

    
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

    if (usuario.estado && usuario.estado !== 'Activo') {
      return res.status(403).json({ success: false, message: 'Tu cuenta está suspendida o fue eliminada. Contacta a soporte.' });
    }

    // Admin y super admin entran directo a su panel; el resto, según su perfil.
    const esStaff = usuario.id_rol === ID_ROL_ADMIN || usuario.id_rol === ID_ROL_SUPERADMIN;
    const idCliente = esStaff ? null : await ProfileModel.hasProfile(usuario.id_usuario);
    const destino = esStaff ? '/admin' : (idCliente ? '/dashboard' : '/profile');

    req.session.regenerate((err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error del servidor.' });
      }

      req.session.usuario = {
        id_usuario: usuario.id_usuario,
        id_rol: usuario.id_rol,
        nombre: usuario.nombre,
        chequeadoEn: Date.now()
      };

      res.json({ success: true, message: 'Inicio de sesión exitoso.', redirect: destino });
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
      nombre: user.nombre,
      chequeadoEn: Date.now()
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