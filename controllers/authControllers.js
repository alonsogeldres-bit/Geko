const crypto = require('crypto');
const bcrypt = require('bcrypt');
const UserModel = require('../models/userModels');
const sso = require('../config/sso');

const showLogin = (req, res) =>
  res.render('post/login', { proveedores: sso.proveedoresHabilitados() });

const showRegister = (req, res) => {
  res.render('post/register');
};

const showProfile = (req, res) => res.render('post/profile', { usuario: req.session.usuario });

const register = async (req, res) => {
  try {
    const { nombre, apellido, nombre_usuario, correo, numero, contrasena } = req.body;

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

/* ===========================================
   AUTENTICACIÓN SOCIAL (Opción B)
   Google entrega correo verificado. Si el correo ya existe en
   `usuarios` se inicia sesión directo; si no, se pide solo lo
   que OAuth NO entrega (teléfono y nombre de usuario) y se crea
   la cuenta. Sin modificar el esquema de la base de datos.
   =========================================== */

const iniciarSesion = (req, res, usuario, destino) => {
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

    res.redirect(destino);
  });
};

const redirectToGoogle = async (req, res) => {
  try {
    if (!sso.isGoogleConfigured()) {
      return res.redirect('/login?error=sso_no_configurado');
    }

    const state = sso.createState();
    req.session.oauth_state = state;

    res.redirect(sso.googleAuthorizationUrl(state));
  } catch (err) {
    console.error(err);
    res.redirect('/login?error=sso_error');
  }
};

const googleCallback = async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect('/login?error=sso_denegado');
    }
    if (!code) {
      return res.redirect('/login?error=sso_error');
    }
    if (!sso.isValidState(state, req.session.oauth_state)) {
      return res.redirect('/login?error=sso_estado');
    }

    delete req.session.oauth_state;

    const tokens = await sso.exchangeCodeForTokens(code);
    const perfil = await sso.fetchGoogleProfile(tokens.access_token);

    if (!perfil.correo || !perfil.correoVerificado) {
      return res.redirect('/login?error=sso_correo');
    }

    const usuario = await UserModel.findByEmail(perfil.correo);

    if (usuario) {
      return iniciarSesion(req, res, usuario, '/profile');
    }

    req.session.oauth_registro = {
      idProveedor: perfil.idProveedor,
      nombre: perfil.nombre,
      apellido: perfil.apellido,
      correo: perfil.correo,
      foto: perfil.foto
    };

    res.redirect('/completar-registro');
  } catch (err) {
    console.error(err);
    res.redirect('/login?error=sso_error');
  }
};

const showCompleteRegister = async (req, res) => {
  const datos = req.session.oauth_registro || {};
  res.render('post/completar-registro', { datos });
};

const completeRegister = async (req, res) => {
  try {
    const pendiente = req.session.oauth_registro;
    if (!pendiente) {
      return res.status(401).json({ success: false, message: 'La sesión de registro expiró. Vuelve a iniciar sesión con Google.' });
    }

    const { apellido, nombre_usuario, numero } = req.body;

    if (await UserModel.existsByUsername(nombre_usuario)) {
      return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está en uso.' });
    }
    if (await UserModel.existsByPhone(numero)) {
      return res.status(409).json({ success: false, message: 'Ese número ya está registrado.' });
    }

    const nombre = pendiente.nombre || nombre_usuario;

    // `usuarios.contrasena_hash` es NOT NULL. Se guarda un hash de un
    // valor aleatorio: la cuenta queda inutilizable por contraseña,
    // que es justo lo deseado para un acceso de tipo social.
    const contrasena_hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    const result = await UserModel.create({
      nombre,
      apellido,
      nombre_usuario,
      correo: pendiente.correo,
      numero,
      contrasena_hash
    });

    delete req.session.oauth_registro;

    iniciarSesion(req, res, {
      id_usuario: result.insertId,
      id_rol: UserModel.ID_ROL_CLIENTE,
      nombre
    }, '/profile');
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Error del servidor.' });
  }
};

module.exports = {
  showLogin,
  showRegister,
  showProfile,
  register,
  login,
  redirectToGoogle,
  googleCallback,
  showCompleteRegister,
  completeRegister
};
