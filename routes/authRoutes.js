const express = require('express');
const router = express.Router();
const authController = require('../controllers/authControllers');
const { requireAuth, redirectIfAuth, requirePendingRegistration } = require('../middlewares/authMiddlewares');
const { validateRegister, validateLogin, validateCompleteRegistration } = require('../middlewares/validators'); 

router.get('/login', redirectIfAuth, authController.showLogin);
router.get('/register', redirectIfAuth, authController.showRegister);
router.get('/profile', requireAuth, authController.showProfile);
router.post('/register', validateRegister, authController.register); 
router.post('/login', validateLogin, authController.login);           


// Password recovery
router.get('/forgot-password', authController.showForgotPassword);

// Social login (Google) and two-step registration
router.get('/auth/google', authController.redirectToGoogle);
router.get('/auth/google/callback', authController.googleCallback);
router.get('/complete-registration', requirePendingRegistration, authController.showCompleteRegistration);
router.post('/complete-registration', requirePendingRegistration, validateCompleteRegistration, authController.completeRegistration);

module.exports = router;