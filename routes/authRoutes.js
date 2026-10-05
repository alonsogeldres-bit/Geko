const express = require('express');
const router = express.Router();
const authController = require('../controllers/authControllers');
const { requireAuth, redirectIfAuth } = require('../middlewares/authMiddlewares');
const { validateRegister, validateLogin } = require('../middlewares/validators'); 

router.get('/login', redirectIfAuth, authController.showLogin);
router.get('/register', redirectIfAuth, authController.showRegister);
router.get('/profile', requireAuth, authController.showProfile);
router.post('/register', validateRegister, authController.register); 
router.post('/login', validateLogin, authController.login);           

module.exports = router;