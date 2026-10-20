const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');
const { requireAuth, requireAuthApi } = require('../middlewares/authMiddlewares');

router.get('/planes', requireAuth, planController.showPlanes);
router.post('/planes/gratis', requireAuthApi, planController.chooseFree);

module.exports = router;
