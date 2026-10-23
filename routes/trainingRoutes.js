const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddlewares');
const trainingController = require('../controllers/trainingController');

router.get('/', requireAuth, trainingController.index);
router.post('/rutina', requireAuth, trainingController.generarOtra);

module.exports = router;
