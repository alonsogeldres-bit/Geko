const crypto = require('crypto');
const bcrypt = require('bcrypt');
const UserModel = require('../models/userModels');
const sso = require('../config/sso');

const showLogin = (req, res) =>
  res.render('post/login', { providers: sso.enabledProviders() });

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
   SOCIAL LOGIN (Option B)
   Google returns a verified email. If it already exists in
   `usuarios`, the user is logged in directly. If not, only the
   fields OAuth cannot deliver are requested (phone and username)
   and the account is created. No database schema changes.

   NOTE: field names below such as nombre, apellido, numero,
   nombre_usuario and correo are COLUMN names in the `usuarios`
   table. They stay in Spanish on purpose; renaming them would
   break the SQL. Everything in this codebase that is not a
   database column is in English.
   =========================================== */

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

const redirectToGoogle = async (req, res) => {
  try {
    if (!sso.isGoogleConfigured()) {
      return res.redirect('/login?error=sso_not_configured');
    }

    const state = sso.createState();
    req.session.oauthState = state;

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
      return res.redirect('/login?error=sso_denied');
    }
    if (!code) {
      return res.redirect('/login?error=sso_error');
    }
    if (!sso.isValidState(state, req.session.oauthState)) {
      return res.redirect('/login?error=sso_state');
    }

    delete req.session.oauthState;

    const tokens = await sso.exchangeCodeForTokens(code);
    const profile = await sso.fetchGoogleProfile(tokens.access_token);

    if (!profile.correo || !profile.correoVerificado) {
      return res.redirect('/login?error=sso_email');
    }

    const user = await UserModel.findByEmail(profile.correo);

    if (user) {
      return startSession(req, res, user, '/profile');
    }

    req.session.oauthRegistration = {
      idProveedor: profile.idProveedor,
      nombre: profile.nombre,
      apellido: profile.apellido,
      correo: profile.correo,
      foto: profile.foto
    };

    res.redirect('/complete-registration');
  } catch (err) {
    console.error(err);
    res.redirect('/login?error=sso_error');
  }
};

const showCompleteRegistration = async (req, res) => {
  const data = req.session.oauthRegistration || {};
  res.render('post/complete-registration', { data });
};

const completeRegistration = async (req, res) => {
  try {
    const pending = req.session.oauthRegistration;
    if (!pending) {
      return res.status(401).json({ success: false, message: 'Registration session expired. Sign in with Google again.' });
    }

    const { apellido, nombre_usuario, numero } = req.body;

    if (await UserModel.existsByUsername(nombre_usuario)) {
      return res.status(409).json({ success: false, message: 'That username is already taken.' });
    }
    if (await UserModel.existsByPhone(numero)) {
      return res.status(409).json({ success: false, message: 'That phone number is already registered.' });
    }

    const nombre = pending.nombre || nombre_usuario;

    // `usuarios.contrasena_hash` is NOT NULL but Google provides no
    // password. A bcrypt hash of random bytes is stored, which leaves
    // the account intentionally unusable via password.
    const contrasena_hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    const result = await UserModel.create({
      nombre,
      apellido,
      nombre_usuario,
      correo: pending.correo,
      numero,
      contrasena_hash
    });

    delete req.session.oauthRegistration;

    startSession(req, res, {
      id_usuario: result.insertId,
      id_rol: UserModel.ID_ROL_CLIENTE,
      nombre
    }, '/profile');
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
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
  showCompleteRegistration,
  completeRegistration
};
