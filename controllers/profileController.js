const ProfileModel = require('../models/profileModel');

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

module.exports = { saveProfile };