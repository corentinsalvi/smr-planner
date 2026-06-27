const CHEMINS_INTERDITS = /^\/(data|src|node_modules)(\/|$)/i;

function bloquerAccesInterne(req, res, next) {
  if (CHEMINS_INTERDITS.test(req.path)) {
    return res.status(404).json({ erreur: 'Ressource introuvable.' });
  }
  next();
}

module.exports = bloquerAccesInterne;
