const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddlewares');
const dashboardController = require('../controllers/dashboardController');

router.get('/', requireAuth, dashboardController.index);
router.post('/sugerencia', requireAuth, dashboardController.sugerencia);
module.exports = router;
