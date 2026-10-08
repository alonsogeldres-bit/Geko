const index = async (req, res) => {
  const user = req.session && req.session.usuario ? {
    nombre: req.session.usuario.nombre || '',
    inicial: (req.session.usuario.nombre || '').charAt(0).toUpperCase(),
    plan: 'Free'
  } : {
    nombre: '',
    inicial: '',
    plan: 'Free'
  };

  res.render('dashboard/index', {
    title: 'GEKO | Dashboard',
    user
  });
};

module.exports = {
  index
};
