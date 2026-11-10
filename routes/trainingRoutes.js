const express = require('express');
const router = express.Router();
const { requireAuth, requireAuthApi } = require('../middlewares/authMiddlewares');
const trainingController = require('../controllers/trainingController');
const retroController = require('../controllers/retroalimentacionController');

router.get('/', requireAuth, trainingController.index);
router.get('/activo', requireAuth, trainingController.activo);
router.post('/finalizar', requireAuth, trainingController.finalizar);
router.post('/esfuerzo', requireAuth, trainingController.evaluarEsfuerzo);
router.post('/sesion', requireAuthApi, trainingController.guardarSesion);

// Cuestionario de retroalimentación post-entrenamiento
router.get('/retroalimentacion', requireAuth, retroController.mostrar);
router.post('/retroalimentacion', requireAuthApi, retroController.guardar);
router.post('/retroalimentacion/omitir', requireAuthApi, retroController.omitir);

module.exports = router;
