const ProfileModel = require('../models/profileModel');

// GET /configuracion — muestra los datos actuales del perfil para editarlos.
// Sin perfil (sin fila en clientes) no hay nada que editar: va al wizard.
const showConfig = async (req, res) => {
  try {
    const perfil = await ProfileModel.getProfileByUser(req.session.usuario.id_usuario);

    if (!perfil) {
      return res.redirect('/profile');
    }

    res.render('post/configuracion', { perfil });
  } catch (err) {
    console.error('[configuración] error al cargar el perfil:', err.message);
    res.status(500).send('No pudimos cargar tu configuración. Inténtalo de nuevo.');
  }
};

// POST /profile — guarda el perfil de entrenamiento del usuario en sesión.
// Los datos ya vienen validados y normalizados en req.profileData.
const saveProfile = async (req, res) => {
  try {
    await ProfileModel.saveProfile(req.session.usuario.id_usuario, req.profileData);
    return res.status(201).json({ success: true, message: 'Perfil guardado.', redirect: '/dashboard' });
  } catch (err) {
    console.error('[profile] error al guardar:', err.message);
    return res.status(500).json({ success: false, message: 'No pudimos guardar tu perfil. Inténtalo de nuevo.' });
  }
};

module.exports = { showConfig, saveProfile };