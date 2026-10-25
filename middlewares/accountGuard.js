/* ===========================================
   GUARDIA DE CUENTA
   Mantiene la sesión sincronizada con la BD: si cambian el rol de alguien
   o lo bloquean/eliminan, el cambio se aplica sin esperar a que vuelva a entrar.
   =========================================== */
const pool = require('../config/db');

const TTL_MS = 30 * 1000;

/** true si la cuenta sigue activa; actualiza id_rol en la sesión. */
const refreshSession = async (req, force = false) => {
  const u = req.session && req.session.usuario;
  if (!u) return true;
  if (!force && u.chequeadoEn && Date.now() - u.chequeadoEn < TTL_MS) return true;

  const [rows] = await pool.query(
    'SELECT id_rol, estado FROM usuarios WHERE id_usuario = ?',
    [u.id_usuario]
  );
  if (!rows.length || rows[0].estado !== 'Activo') return false;

  u.id_rol = rows[0].id_rol;
  u.chequeadoEn = Date.now();
  return true;
};

const rechazar = (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    if (req.accepts(['html', 'json']) === 'json') {
      return res.status(401).json({ success: false, message: 'Tu cuenta no está disponible.' });
    }
    return res.redirect('/login?error=cuenta_inactiva');
  });
};

/** Middleware global: falla abierto si la BD no responde (no tumba a todos). */
const guardAccount = async (req, res, next) => {
  try {
    if (!(await refreshSession(req))) return rechazar(req, res);
  } catch (err) {
    console.error('[cuenta] no se pudo verificar la cuenta:', err.message);
  }
  next();
};

module.exports = { refreshSession, guardAccount, rechazar };
