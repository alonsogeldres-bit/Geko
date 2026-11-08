const express = require('express');
const router = express.Router();
const { requireAuthApi } = require('../middlewares/authMiddlewares');
const { requirePaidPlan } = require('../middlewares/planMiddleware');
const gekoChatController = require('../controllers/gekoChatController');

/* Chat de la mascota Geko. Solo puede modificar la rutina de hoy y únicamente cuando
   el usuario acepta una propuesta; nunca toca el perfil ni otros datos.
   Es exclusivo del plan Premium: en Gratis Geko muestra consejos fijos
   (public/js/geko-tips.js) y estas rutas responden 402. */
router.post('/chat', requireAuthApi, requirePaidPlan('chat_geko'), gekoChatController.chat);
router.post('/chat/reset', requireAuthApi, requirePaidPlan('chat_geko'), gekoChatController.reset);
router.post('/chat/rutina/aceptar', requireAuthApi, requirePaidPlan('chat_geko'), gekoChatController.aceptarCambio);
router.post('/chat/rutina/rechazar', requireAuthApi, requirePaidPlan('chat_geko'), gekoChatController.rechazarCambio);

module.exports = router;
