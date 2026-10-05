const crypto = require('crypto');
const bcrypt = require('bcrypt');
const UserModel = require('../models/userModels');
const sso = require('../config/sso');
const mailer = require('../config/mailer');
const recovery = require('../config/recovery');

const showLogin = (req, res) =>
  res.render('post/login', { providers: sso.enabledProviders() });

const showRegister = (req, res) => {
  res.render('post/register');
};

const showForgotPassword = (req, res) => {
  res.render('post/forgot-password');
};

/* Message sent whether or not the account exists, so the form
   cannot be used to find out which emails are registered. */
const NEUTRAL_MESSAGE =
  'Si ese correo está registrado en GEKO, te enviamos un enlace para crear una nueva contraseña.';

const forgotPassword = async (req, res) => {
  const correo = String(req.body.correo || '').trim().toLowerCase();

  if (!mailer.isMailConfigured()) {
    console.warn(`[recuperación] correo no enviado: ${mailer.mailNotice()}`);
    return res.json({ success: true, message: NEUTRAL_MESSAGE, delivery: 'disabled' });
  }

  try {
    const user = await UserModel.findByEmail(correo);

    if (user) {
      const token = recovery.createToken(user.id_usuario);
      const resetUrl = recovery.buildResetUrl(token);

      await mailer.sendMail({
        to: correo,
        subject: 'Recupera tu contraseña de GEKO',
        text: [
          'Hola,',
          '',
          'Recibimos una solicitud para crear una nueva contraseña de tu cuenta GEKO.',
          '',
          resetUrl,
          '',
          `El enlace vence en ${recovery.TTL_MINUTES} minutos.`,
          'Si no solicitaste esto, ignora este mensaje: tu contraseña actual sigue vigente.',
        ].join('\n'),
        html: [
          '<p>Hola,</p>',
          '<p>Recibimos una solicitud para crear una nueva contraseña de tu cuenta GEKO.</p>',
          `<p><a href="${resetUrl}">Crear una nueva contraseña</a></p>`,
          `<p style="color:#666">El enlace vence en ${recovery.TTL_MINUTES} minutos.</p>`,
          '<p style="color:#666">Si no solicitaste esto, ignora este mensaje: tu contraseña actual sigue vigente.</p>',
        ].join(''),
      });
    }

    return res.json({ success: true, message: NEUTRAL_MESSAGE });
  } catch (error) {
    console.error('[recuperación] error al enviar:', error.message);
    return res.json({ success: true, message: NEUTRAL_MESSAGE });
  }
};

const showResetPassword = (req, res) => {
  const { valid, idUsuario, reason } = recovery.verifyToken(req.query.token);

  if (!valid) {
    return res.render('post/reset-password', { valid: false, reason, token: '' });
  }

  res.render('post/reset-password', { valid: true, reason: '', token: req.query.token });
};

const resetPassword = async (req, res) => {
  const { valid, idUsuario, reason } = recovery.verifyToken(req.body.token);

  if (!valid) {
    return res.status(400).json({ success: false, message: reason });
  }

  try {
    const hash = await bcrypt.hash(req.body.contrasena, 10);
    const affected = await UserModel.updatePassword(idUsuario, hash);

    if (!affected) {
      return res.status(400).json({ success: false, message: 'La cuenta ya no existe.' });
    }

    req.session.destroy(() => {});
    return res.json({ success: true, message: 'Tu contraseña fue actualizada. Ya puedes iniciar sesión.' });
  } catch (error) {
    console.error('[recuperación] error al guardar:', error.message);
    return res.status(500).json({ success: false, message: 'No pudimos actualizar tu contraseña.' });
  }
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
  showForgotPassword,
  forgotPassword,
  showResetPassword,
  resetPassword,
  register,
  login,
  redirectToGoogle,
  googleCallback,
  showCompleteRegistration,
  completeRegistration
};
