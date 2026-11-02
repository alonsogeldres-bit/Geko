const express = require('express');
const router = express.Router();
const helpController = require('../controllers/helpController');
const { requireAuth } = require('../middlewares/authMiddlewares');

/* Centro de ayuda: preguntas frecuentes, planes, contacto y redes sociales. */
router.get('/', requireAuth, helpController.showAyuda);

module.exports = router;
