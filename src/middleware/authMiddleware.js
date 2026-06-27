const { verifierToken } = require('../services/authService');

const ROLES_VALIDES = new Set([
  'MEDECIN_SMR', 'KINESITHERAPEUTE', 'ERGOTHERAPEUTE', 'ORTHOPHONISTE',
  'NEUROPSYCHOLOGUE', 'DIETETICIEN', 'ASSISTANTE_SOCIALE', 'IDE_COORDINATRICE',
  'AIDE_SOIGNANT', 'DIRECTEUR'
]);

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erreur: 'Authentification requise. Veuillez vous reconnecter.' });
  }

  try {
    const payload = verifierToken(token);

    if (!payload?.id || !payload?.role || !ROLES_VALIDES.has(payload.role)) {
      return res.status(401).json({ erreur: 'Jeton invalide ou rôle non reconnu.' });
    }

    req.utilisateur = payload;
    next();
  } catch (err) {
    return res.status(401).json({ erreur: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
  }
}

module.exports = authMiddleware;
