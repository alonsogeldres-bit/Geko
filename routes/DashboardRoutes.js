const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.render('post/dashboard');
});

module.exports = router;
