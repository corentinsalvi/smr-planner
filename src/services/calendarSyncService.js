const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { readAll, withWriteLock } = require('../utils/jsonStore');
const { formaterDateLocale } = require('../utils/dateUtils');
const { genererFluxIcsAbonnement } = require('../utils/icsUtils');

const COLLECTION = 'calendar_sync_tokens';
const FENETRE_PASSEE_JOURS = 7;
const FENETRE_FUTURE_JOURS = 180;

function hasherToken(secret) {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

function comparerHashes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function construireUrlPublique(req, syncUuid, tokenSecret) {
  const base = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  return `${base}/v1/calendar/sync-${syncUuid}-${tokenSecret}.ics`;
}

function ajouterJours(dateStr, jours) {
  const [y, m, jour] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, jour);
  d.setDate(d.getDate() + jours);
  return formaterDateLocale(d);
}

function recupererCreneauxAbonnement(employeId) {
  const aujourdhui = formaterDateLocale(new Date());
  const dateDebut = ajouterJours(aujourdhui, -FENETRE_PASSEE_JOURS);
  const dateFin = ajouterJours(aujourdhui, FENETRE_FUTURE_JOURS);

  return readAll('creneaux').filter(c =>
    c.employe_id === employeId &&
    c.statut !== 'ANNULE' &&
    c.date >= dateDebut &&
    c.date <= dateFin
  );
}

async function obtenirStatutSync(employeId) {
  const jetons = readAll(COLLECTION);
  const actif = jetons.find(t => t.employe_id === employeId && t.actif);

  if (!actif) {
    return { actif: false, created_at: null, last_accessed_at: null };
  }

  return {
    actif: true,
    sync_uuid: actif.sync_uuid,
    created_at: actif.created_at,
    last_accessed_at: actif.last_accessed_at
  };
}

async function creerOuRegenererJeton(employeId, req) {
  const tokenSecret = crypto.randomBytes(32).toString('hex');
  const syncUuid = uuidv4();
  const tokenHash = hasherToken(tokenSecret);
  const now = new Date().toISOString();

  await withWriteLock(COLLECTION, async (jetons) => {
    const misAJour = jetons.map(t => {
      if (t.employe_id !== employeId || !t.actif) return t;
      return { ...t, actif: false, revoked_at: now };
    });

    const nouveau = {
      id: uuidv4(),
      employe_id: employeId,
      sync_uuid: syncUuid,
      token_hash: tokenHash,
      actif: true,
      revoked_at: null,
      created_at: now,
      last_accessed_at: null
    };

    return { data: [...misAJour, nouveau], returnValue: nouveau };
  });

  const url = construireUrlPublique(req, syncUuid, tokenSecret);

  return {
    url,
    sync_uuid: syncUuid,
    created_at: now,
    message: 'Lien de synchronisation généré. Conservez-le en lieu sûr : il ne sera plus affiché en entier.'
  };
}

async function revoquerJeton(employeId) {
  const now = new Date().toISOString();
  let revoque = false;

  await withWriteLock(COLLECTION, async (jetons) => {
    const misAJour = jetons.map(t => {
      if (t.employe_id !== employeId || !t.actif) return t;
      revoque = true;
      return { ...t, actif: false, revoked_at: now };
    });
    return { data: misAJour, returnValue: revoque };
  });

  return revoque;
}

async function validerEtServirFlux(syncUuid, tokenSecret) {
  const jetons = readAll(COLLECTION);
  const jeton = jetons.find(t => t.sync_uuid === syncUuid && t.actif);

  if (!jeton || !comparerHashes(jeton.token_hash, hasherToken(tokenSecret))) {
    return null;
  }

  const employes = readAll('employes');
  const employe = employes.find(e => e.id === jeton.employe_id && e.actif !== false);
  if (!employe) return null;

  const creneaux = recupererCreneauxAbonnement(employe.id);
  const patients = readAll('patients');

  const now = new Date().toISOString();
  await withWriteLock(COLLECTION, async (all) => {
    const data = all.map(t =>
      t.id === jeton.id ? { ...t, last_accessed_at: now } : t
    );
    return { data, returnValue: true };
  });

  const ics = genererFluxIcsAbonnement({
    creneaux,
    patients,
    nomCalendrier: `SMR — ${employe.prenom} ${employe.nom}`
  });

  return ics;
}

module.exports = {
  obtenirStatutSync,
  creerOuRegenererJeton,
  revoquerJeton,
  validerEtServirFlux,
  construireUrlPublique
};
