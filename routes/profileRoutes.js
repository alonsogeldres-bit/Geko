const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { requireAuthApi } = require('../middlewares/authMiddlewares');
const { validateProfile } = require('../middlewares/validators');

router.post('/profile', requireAuthApi, validateProfile, profileController.saveProfile);

module.exports = router;