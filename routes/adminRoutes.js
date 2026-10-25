const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { requireAdmin, requireSuperAdmin } = require('../middlewares/authMiddlewares');
const admin = require('../controllers/adminController');

// Todo el panel exige admin o super admin (rol revalidado contra la BD).
router.use(requireAdmin);

// Token CSRF por sesión + mensajes flash + datos comunes de las vistas.
router.use((req, res, next) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  if (req.method === 'POST') {
    const enviado = Buffer.from(String(req.body._csrf || ''));
    const esperado = Buffer.from(req.session.csrf);
    if (enviado.length !== esperado.length || !crypto.timingSafeEqual(enviado, esperado)) {
      return res.status(403).send('Solicitud no válida. Recarga la página e inténtalo de nuevo.');
    }
  }
  res.locals.csrf = req.session.csrf;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.usuario = req.session.usuario;
  res.locals.esSuper = req.session.usuario.id_rol === 3;
  next();
});

router.get('/', admin.dashboard);
router.get('/usuarios', admin.listaUsuarios);
router.get('/usuarios/:id', admin.detalleUsuario);
router.post('/usuarios/:id/estado', admin.cambiarEstado);
router.post('/usuarios/:id/eliminar', admin.eliminar);
router.post('/usuarios/:id/premium', admin.premium);
router.post('/usuarios/:id/reset-password', admin.resetPassword);
router.post('/usuarios/:id/rol', requireSuperAdmin, admin.cambiarRol);
router.get('/admins/nuevo', requireSuperAdmin, admin.formNuevoAdmin);
router.post('/admins/nuevo', requireSuperAdmin, admin.crearAdmin);
router.get('/auditoria', admin.auditoria);

module.exports = router;