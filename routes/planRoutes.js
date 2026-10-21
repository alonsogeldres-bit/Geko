const express = require('express');
const router = express.Router();
const planController = require('../controllers/planController');
const { requireAuth, requireAuthApi } = require('../middlewares/authMiddlewares');

// Página de planes: requiere sesión (sin sesión → redirect /login).
router.get('/planes', requireAuth, planController.showPlanes);

// Activación del plan gratuito (JSON).
router.post('/planes/gratis', requireAuthApi, planController.chooseFree);

// Checkout Premium con Mercado Pago (JSON).
router.post('/planes/premium', requireAuthApi, planController.startCheckout);

// Retorno del navegador desde Mercado Pago (puede venir sin sesión).
router.get('/planes/retorno', planController.retornoPago);

// Notificación servidor-a-servidor de PayPal (sin autenticación).
router.post('/webhook/paypal', planController.recibirWebhook);

module.exports = router;
