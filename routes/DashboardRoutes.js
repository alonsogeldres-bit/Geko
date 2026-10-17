const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddlewares');

router.get('/', requireAuth, (req, res) => {
  res.render('post/dashboard', { usuario: req.session.usuario });
});

module.exports = router;