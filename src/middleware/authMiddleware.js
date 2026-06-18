const { verifierToken } = require('../services/authService');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erreur: 'Authentification requise. Veuillez vous reconnecter.' });
  }

  try {
    req.utilisateur = verifierToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ erreur: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
  }
}

module.exports = authMiddleware;
