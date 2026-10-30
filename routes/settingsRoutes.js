const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { requireAuth, requireAuthApi } = require('../middlewares/authMiddlewares');
const { validateAccountUpdate, validatePasswordChange } = require('../middlewares/validators');

/* Hub de configuración */
router.get('/', requireAuth, settingsController.showHub);

/* Datos personales */
router.get('/datos', requireAuth, settingsController.showDatos);
router.post('/datos', requireAuthApi, validateAccountUpdate, settingsController.updateDatos);

/* Seguridad (contraseña) */
router.get('/seguridad', requireAuth, settingsController.showSeguridad);
router.post('/seguridad', requireAuthApi, validatePasswordChange, settingsController.updatePassword);

/* Perfil de entrenamiento (el formulario que antes vivía en /configuracion).
   El guardado sigue usando POST /profile, compartido con el wizard. */
router.get('/entrenamiento', requireAuth, settingsController.showEntrenamiento);

/* Apariencia (tema claro / oscuro): el interruptor vive en el hub. */

/* Mi cuenta (plan y sesión) */
router.get('/cuenta', requireAuth, settingsController.showCuenta);

module.exports = router;
