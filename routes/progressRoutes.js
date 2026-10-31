const express = require('express');
const router = express.Router();
const { requireAuth, requireAuthApi } = require('../middlewares/authMiddlewares');
const progressController = require('../controllers/progressController');

router.get('/', requireAuth, progressController.index);
router.post('/medicion', requireAuth, requireAuthApi, progressController.registrarMedicion);

module.exports = router;
