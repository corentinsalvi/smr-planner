const rateLimit = require('express-rate-limit');

const fenetreMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const maxGlobal = Number(process.env.RATE_LIMIT_MAX) || 100;
const maxAuth = Number(process.env.RATE_LIMIT_AUTH_MAX) || 20;
const maxPlanning = Number(process.env.RATE_LIMIT_PLANNING_MAX) || 30;

function messageLimite() {
  return { erreur: 'Trop de requêtes. Réessayez dans quelques minutes.' };
}

const limiteurGlobal = rateLimit({
  windowMs: fenetreMs,
  max: maxGlobal,
  standardHeaders: true,
  legacyHeaders: false,
  message: messageLimite()
});

const limiteurAuth = rateLimit({
  windowMs: fenetreMs,
  max: maxAuth,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: 'Trop de tentatives de connexion. Réessayez plus tard.' }
});

const limiteurPlanning = rateLimit({
  windowMs: fenetreMs,
  max: maxPlanning,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erreur: 'Limite de génération de planning atteinte. Patientez avant de réessayer.' }
});

module.exports = {
  limiteurGlobal,
  limiteurAuth,
  limiteurPlanning
};
