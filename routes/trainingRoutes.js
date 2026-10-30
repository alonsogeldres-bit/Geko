const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddlewares');
const trainingController = require('../controllers/trainingController');

router.get('/', requireAuth, trainingController.index);
<<<<<<< Updated upstream
router.get('/activo', requireAuth, trainingController.activo);
=======
router.post('/finalizar', requireAuth, trainingController.finalizar);
>>>>>>> Stashed changes

module.exports = router;