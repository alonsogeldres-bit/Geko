const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { requireAuth, requireAuthApi } = require('../middlewares/authMiddlewares');
const { validateProfile } = require('../middlewares/validators');

router.get('/configuracion', requireAuth, profileController.showConfig);
router.post('/profile', requireAuthApi, validateProfile, profileController.saveProfile);

module.exports = router;