const express = require('express');
const router = express.Router();
const authController = require('../controllers/authControllers');
const authRecoverySocialController = require('../controllers/authRecoverySocialController');
const { requireAuth, redirectIfAuth, requirePendingRegistration } = require('../middlewares/authMiddlewares');
const { validateRegister, validateLogin, validateCompleteRegistration, validateForgotPassword, validateResetPassword } = require('../middlewares/validators');

router.get('/login', redirectIfAuth, authController.showLogin);
router.get('/register', redirectIfAuth, authController.showRegister);
router.get('/terms', authController.showTerminos);
router.get('/politic', authController.showPrivacidad);

router.get('/profile', requireAuth, authController.showProfile);
router.post('/register', validateRegister, authController.register);
router.post('/login', validateLogin, authController.login);
router.post('/logout', authController.logout);

// Password recovery
router.get('/forgot-password', authRecoverySocialController.showForgotPassword);
router.post('/forgot-password', validateForgotPassword, authRecoverySocialController.forgotPassword);
router.get('/reset-password', authRecoverySocialController.showResetPassword);
router.post('/reset-password', validateResetPassword, authRecoverySocialController.resetPassword);

// Social login (Google) and two-step registration
router.get('/auth/google', authRecoverySocialController.redirectToGoogle);
router.get('/auth/google/callback', authRecoverySocialController.googleCallback);
router.get('/complete-registration', requirePendingRegistration, authRecoverySocialController.showCompleteRegistration);
router.post('/complete-registration', requirePendingRegistration, validateCompleteRegistration, authRecoverySocialController.completeRegistration);

module.exports = router;
