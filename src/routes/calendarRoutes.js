const express = require('express');
const router = express.Router();
const requireHttps = require('../middleware/requireHttps');
const {
  obtenirStatutSync,
  creerOuRegenererJeton,
  revoquerJeton,
  validerEtServirFlux
} = require('../services/calendarSyncService');

/**
 * GET /v1/calendar/sync-[UUID]-[TOKEN].ics
 *
 * Flux iCal public en lecture seule (RFC 5545).
 * Le couple UUID v4 + token secret (64 hex) fait office de credential.
 * Réponse 404 si token invalide ou révoqué (pas de fuite d'information).
 */
router.get(/.*/, requireHttps, async (req, res, next) => {
  const match = req.path.match(
    /^\/sync-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-([0-9a-f]{64})\.ics$/i
  );
  if (!match) return next();

  const [, syncUuid, tokenSecret] = match;
  const ics = await validerEtServirFlux(syncUuid, tokenSecret);
  if (!ics) {
    return res.status(404).send('Not Found');
  }

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  res.send(ics);
});

module.exports = router;

/**
 * Routes de gestion (JWT) — montées séparément sous /api/calendar/sync
 */
function creerRoutesGestion() {
  const gestion = express.Router();

  // GET /api/calendar/sync — statut sans exposer le secret
  gestion.get('/', async (req, res) => {
    const statut = await obtenirStatutSync(req.utilisateur.id);
    if (!statut.actif) {
      return res.json({ actif: false });
    }

    const base = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    res.json({
      actif: true,
      url_masquee: `${base}/v1/calendar/sync-${statut.sync_uuid}-••••••••.ics`,
      created_at: statut.created_at,
      last_accessed_at: statut.last_accessed_at
    });
  });

  // POST /api/calendar/sync — génère ou régénère le lien (révoque l'ancien)
  gestion.post('/', async (req, res) => {
    const resultat = await creerOuRegenererJeton(req.utilisateur.id, req);
    res.status(201).json(resultat);
  });

  // DELETE /api/calendar/sync — révoque immédiatement le lien actif
  gestion.delete('/', async (req, res) => {
    const revoque = await revoquerJeton(req.utilisateur.id);
    if (!revoque) {
      return res.status(404).json({ erreur: 'Aucun lien de synchronisation actif.' });
    }
    res.json({ message: 'Lien de synchronisation révoqué. L\'ancienne URL ne fonctionne plus.' });
  });

  return gestion;
}

module.exports.creerRoutesGestion = creerRoutesGestion;
