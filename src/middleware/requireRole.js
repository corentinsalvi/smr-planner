function requireRole(...rolesAutorises) {
  const autorises = new Set(rolesAutorises);
  return (req, res, next) => {
    if (!req.utilisateur || !autorises.has(req.utilisateur.role)) {
      return res.status(403).json({ erreur: 'Accès non autorisé pour votre rôle.' });
    }
    next();
  };
}

module.exports = requireRole;
