const express = require('express')
const router = express.Router()
const post_controller = require('../controllers/postControllers')

router.get('/', post_controller.splash);

module.exports = router