const express = require('express');
const router = express.Router();
const { requireAuthApi } = require('../middlewares/authMiddlewares');
const gekoChatController = require('../controllers/gekoChatController');

/* Chat de la mascota Geko (solo lectura: no modifica rutina ni datos). */
router.post('/chat', requireAuthApi, gekoChatController.chat);
router.post('/chat/reset', requireAuthApi, gekoChatController.reset);

module.exports = router;
