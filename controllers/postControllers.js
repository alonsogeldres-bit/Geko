const db = require('../config/db');


const splash = async (req, res) => {
    res.render('post/splash')
}
 
const login = async(req, res) => {
    res.render('post/login')
}

const profile = async(req, res) => {
    res.render('post/profile')
}

module.exports = {
    splash,
    login,
    profile
}