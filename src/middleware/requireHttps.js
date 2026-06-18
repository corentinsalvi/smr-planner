/**
 * En production, refuse les requêtes non-HTTPS sur les flux calendrier.
 * Compatible reverse-proxy (X-Forwarded-Proto).
 */
function requireHttps(req, res, next) {
  if (process.env.NODE_ENV !== 'production') return next();

  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  if (proto !== 'https') {
    return res.status(403).json({ erreur: 'Le flux calendrier nécessite une connexion HTTPS.' });
  }
  next();
}

module.exports = requireHttps;
