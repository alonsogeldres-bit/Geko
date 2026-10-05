const express = require('express');
const router = express.Router();
const authController = require('../controllers/authControllers');
const { requireAuth, redirectIfAuth, requirePendingRegistration } = require('../middlewares/authMiddlewares');
const { validateRegister, validateLogin, validateCompleteRegister } = require('../middlewares/validators'); 

router.get('/login', redirectIfAuth, authController.showLogin);
router.get('/register', redirectIfAuth, authController.showRegister);
router.get('/profile', requireAuth, authController.showProfile);
router.post('/register', validateRegister, authController.register); 
router.post('/login', validateLogin, authController.login);           

// Autenticación social (Google) y alta con paso intermedio
router.get('/auth/google', authController.redirectToGoogle);
router.get('/auth/google/callback', authController.googleCallback);
router.get('/completar-registro', requirePendingRegistration, authController.showCompleteRegister);
router.post('/completar-registro', requirePendingRegistration, validateCompleteRegister, authController.completeRegister);

module.exports = router;