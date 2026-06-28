const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const fenetreMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const maxGlobal = Number(process.env.RATE_LIMIT_MAX) || 500;
const maxAuth = Number(process.env.RATE_LIMIT_AUTH_MAX) || 30;
const maxPlanning = Number(process.env.RATE_LIMIT_PLANNING_MAX) || 20;
const limiterActifEnDev = process.env.RATE_LIMIT_EN_DEV === 'true';
const compterLectures = process.env.RATE_LIMIT_COUNT_GET === 'true';

function messageLimite() {
  return { erreur: 'Trop de requêtes. Réessayez dans quelques minutes.' };
}

function limiterDesactive() {
  return process.env.NODE_ENV !== 'production' && !limiterActifEnDev;
}

function cleParUtilisateurOuIp(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ') && process.env.JWT_SECRET) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      if (payload?.id) return `user:${payload.id}`;
    } catch {
      // Jeton absent ou invalide : regroupement par IP
    }
  }
  return ipKeyGenerator(req);
}

function skipRequeteNormale(req) {
  if (limiterDesactive()) return true;
  if (!compterLectures && req.method === 'GET') return true;
  return false;
}

const limiteurGlobal = rateLimit({
  windowMs: fenetreMs,
  max: maxGlobal,
  standardHeaders: true,
  legacyHeaders: false,
  message: messageLimite(),
  keyGenerator: cleParUtilisateurOuIp,
  skip: skipRequeteNormale
});

const limiteurAuth = rateLimit({
  windowMs: fenetreMs,
  max: maxAuth,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: 'Trop de tentatives de connexion. Réessayez plus tard.' },
  skip: () => limiterDesactive()
});

const limiteurPlanning = rateLimit({
  windowMs: fenetreMs,
  max: maxPlanning,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: 'Limite de génération de planning atteinte. Patientez avant de réessayer.' },
  keyGenerator: cleParUtilisateurOuIp,
  skip: () => limiterDesactive()
});

module.exports = {
  limiteurGlobal,
  limiteurAuth,
  limiteurPlanning
};
