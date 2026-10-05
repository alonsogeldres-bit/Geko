const bcrypt = require('bcrypt');
const UserModel = require('../models/userModels');

const showLogin = (req, res) => {
  res.render('post/login');
};

const showRegister = (req, res) => {
  res.render('post/register');
};

const showProfile = (req, res) => {
  res.render('post/profile');
};

const register = async (req, res) => {
  try {
    const { nombre, apellido, nombre_usuario, correo, numero, contrasena } = req.body;

    if (!nombre || !apellido || !nombre_usuario || !correo || !numero || !contrasena) {
      return res.status(400).json({ success: false, message: 'Completa todos los campos.' });
    }

    if (await UserModel.existsByEmail(correo)) {
      return res.status(409).json({ success: false, message: 'Ese correo ya está registrado.' });
    }

    if (await UserModel.existsByUsername(nombre_usuario)) {
      return res.status(409).json({ success: false, message: 'Ese nombre de usuario ya está en uso.' });
    }

    if (await UserModel.existsByPhone(numero)) {
      return res.status(409).json({ success: false, message: 'Ese número de teléfono ya está registrado.' });
    }

    const contrasena_hash = await bcrypt.hash(contrasena, 10);

    await UserModel.create({ nombre, apellido, nombre_usuario, correo, numero, contrasena_hash });

    return res.json({ success: true, message: 'Cuenta creada correctamente.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Error del servidor.' });
  }
};

const login = async (req, res) => {
  try {
    const { correo, contrasena } = req.body;

    if (!correo || !contrasena) {
      return res.status(400).json({ success: false, message: 'Completa correo y contraseña.' });
    }

    const usuario = await UserModel.findByEmail(correo);
    if (!usuario) {
      return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos.' });
    }

    const coincide = await bcrypt.compare(contrasena, usuario.contrasena_hash);
    if (!coincide) {
      return res.status(401).json({ success: false, message: 'Correo o contraseña incorrectos.' });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: 'Error del servidor.' });
      }

      req.session.usuario = {
        id_usuario: usuario.id_usuario,
        id_rol: usuario.id_rol,
        nombre: usuario.nombre
      };

      return res.json({ success: true, message: 'Inicio de sesión exitoso.' });
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Error del servidor.' });
  }
};

module.exports = { showLogin, showRegister, showProfile, register, login };