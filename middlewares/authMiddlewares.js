const { ID_ROL_ADMIN } = require('../models/userModels');

const requireAuth = (req, res, next) => {
  if (req.session.usuario) return next();
  return res.redirect('/login');
};

const requireAdmin = (req, res, next) => {
  if (!req.session.usuario) return res.redirect('/login');
  if (req.session.usuario.id_rol !== ID_ROL_ADMIN) {
    return res.status(403).send('Acceso denegado');
  }
  next();
};

const redirectIfAuth = (req, res, next) => {
  if (req.session.usuario) return res.redirect('/profile');
  next();
};

const requirePendingRegistration = (req, res, next) => {
  if (!req.session.oauthRegistration) {
    return res.redirect('/login?error=sso_registration');
  }
  next();
};

module.exports = { requireAuth, requireAdmin, redirectIfAuth, requirePendingRegistration };