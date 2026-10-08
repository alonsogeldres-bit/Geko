const crypto = require('crypto');
const bcrypt = require('bcrypt');
const UserModel = require('../models/userModels');
const sso = require('../config/sso');
const mailer = require('../config/mailer');
const recovery = require('../config/recovery');
const { sendWelcomeEmail } = require('../config/welcomeMail');
const { startSession } = require('./authControllers');

const MSG_ENVIADO = 'El correo fue enviado con éxito. Revisa tu bandeja de entrada y la carpeta de spam.';
const MSG_INEXISTENTE = 'El correo es inexistente.';
const MSG_ERROR_ENVIO = 'No pudimos enviar el correo. Inténtalo de nuevo en unos minutos.';

const showForgotPassword = (req, res) => {
  res.render('post/forgot-password');
};

const forgotPassword = async (req, res) => {
  const correo = String(req.body.correo || '').trim().toLowerCase();

  try {
    const user = await UserModel.findByEmail(correo);

    if (!user) {
      return res.status(404).json({ success: false, message: MSG_INEXISTENTE });
    }

    if (!mailer.isMailConfigured()) {
      console.warn(`[recuperación] correo no enviado: ${mailer.mailNotice()}`);
      return res.status(503).json({
        success: false,
        message: 'El envío de correos no está disponible por ahora.',
      });
    }

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

    return res.json({ success: true, message: MSG_ENVIADO });
  } catch (error) {
    console.error('[recuperación] error:', error.message);
    return res.status(500).json({ success: false, message: MSG_ERROR_ENVIO });
  }
};

const showResetPassword = (req, res) => {
  const { valid, reason } = recovery.verifyToken(req.query.token);

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

    const { nombre, apellido, nombre_usuario, numero, fecha_nacimiento } = req.body;

    if (await UserModel.existsByUsername(nombre_usuario)) {
      return res.status(409).json({ success: false, message: 'That username is already taken.' });
    }
    if (await UserModel.existsByPhone(numero)) {
      return res.status(409).json({ success: false, message: 'That phone number is already registered.' });
    }

    const nombreFinal = (nombre || pending.nombre || nombre_usuario || '').trim();

    // `usuarios.contrasena_hash` is NOT NULL but Google provides no
    // password. A bcrypt hash of random bytes is stored, which leaves
    // the account intentionally unusable via password.
    const contrasena_hash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

    const result = await UserModel.create({
      nombre: nombreFinal,
      apellido,
      nombre_usuario,
      correo: pending.correo,
      numero,
      contrasena_hash,
      fecha_nacimiento
    });

    delete req.session.oauthRegistration;

    // Sin await: el correo no retrasa ni bloquea el registro.
    sendWelcomeEmail({ to: pending.correo, nombre: nombreFinal, metodo: 'google' });

    startSession(req, res, {
      id_usuario: result.insertId,
      id_rol: UserModel.ID_ROL_CLIENTE,
      nombre: nombreFinal
    }, '/profile');
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};


module.exports = {
  showForgotPassword,
  forgotPassword,
  showResetPassword,
  resetPassword,
  redirectToGoogle,
  googleCallback,
  showCompleteRegistration,
  completeRegistration
};