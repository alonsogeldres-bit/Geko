const { ID_ROL_ADMIN, ID_ROL_SUPERADMIN } = require('../models/userModels');
const { refreshSession, rechazar } = require('./accountGuard');

const requireAuth = (req, res, next) => {
  if (req.session.usuario) return next();
  return res.redirect('/login');
};

const requireAuthApi = (req, res, next) => {
  if (req.session.usuario) return next();
  return res.status(401).json({ success: false, message: 'Tu sesión expiró. Inicia sesión de nuevo.' });
};

/** Admin o super admin. Revalida el rol contra la BD en cada petición. */
const requireAdmin = async (req, res, next) => {
  if (!req.session.usuario) return res.redirect('/login');
  try {
    if (!(await refreshSession(req, true))) return rechazar(req, res);
  } catch (err) {
    console.error('[admin] no se pudo validar el rol:', err.message);
    return res.status(500).send('No pudimos verificar tu acceso.');
  }
  const rol = req.session.usuario.id_rol;
  if (rol !== ID_ROL_ADMIN && rol !== ID_ROL_SUPERADMIN) {
    return res.status(403).send('Acceso denegado');
  }
  next();
};

/** Solo super admin (se usa después de requireAdmin). */
const requireSuperAdmin = (req, res, next) => {
  if (!req.session.usuario || req.session.usuario.id_rol !== ID_ROL_SUPERADMIN) {
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

module.exports = { requireAuth, requireAuthApi, requireAdmin, requireSuperAdmin, redirectIfAuth, requirePendingRegistration };