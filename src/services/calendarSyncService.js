const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { CalendarSyncToken, Creneau, Employe, Patient } = require('../models');
const { formaterDateLocale } = require('../utils/dateUtils');
const { genererFluxIcsAbonnement } = require('../utils/icsUtils');

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

async function recupererCreneauxAbonnement(employeId, clinicId) {
  const aujourdhui = formaterDateLocale(new Date());
  const dateDebut = ajouterJours(aujourdhui, -FENETRE_PASSEE_JOURS);
  const dateFin = ajouterJours(aujourdhui, FENETRE_FUTURE_JOURS);

  return Creneau.find({
    clinic_id: clinicId,
    employe_id: employeId,
    statut: { $ne: 'ANNULE' },
    date: { $gte: dateDebut, $lte: dateFin }
  }).lean();
}

async function obtenirStatutSync(employeId, clinicId) {
  const actif = await CalendarSyncToken.findOne({
    clinic_id: clinicId,
    employe_id: employeId,
    actif: true
  }).lean();

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

async function creerOuRegenererJeton(employeId, clinicId, req) {
  const tokenSecret = crypto.randomBytes(32).toString('hex');
  const syncUuid = uuidv4();
  const tokenHash = hasherToken(tokenSecret);
  const now = new Date().toISOString();

  await CalendarSyncToken.updateMany(
    { clinic_id: clinicId, employe_id: employeId, actif: true },
    { actif: false, revoked_at: now }
  );

  await CalendarSyncToken.create({
    id: uuidv4(),
    clinic_id: clinicId,
    employe_id: employeId,
    sync_uuid: syncUuid,
    token_hash: tokenHash,
    actif: true,
    revoked_at: null,
    created_at: now,
    last_accessed_at: null
  });

  const url = construireUrlPublique(req, syncUuid, tokenSecret);

  return {
    url,
    sync_uuid: syncUuid,
    created_at: now,
    message: 'Lien de synchronisation généré. Conservez-le en lieu sûr : il ne sera plus affiché en entier.'
  };
}

async function revoquerJeton(employeId, clinicId) {
  const now = new Date().toISOString();
  const result = await CalendarSyncToken.updateMany(
    { clinic_id: clinicId, employe_id: employeId, actif: true },
    { actif: false, revoked_at: now }
  );
  return result.modifiedCount > 0;
}

async function validerEtServirFlux(syncUuid, tokenSecret) {
  const jeton = await CalendarSyncToken.findOne({ sync_uuid: syncUuid, actif: true }).lean();

  if (!jeton || !comparerHashes(jeton.token_hash, hasherToken(tokenSecret))) {
    return null;
  }

  const employe = await Employe.findOne({
    id: jeton.employe_id,
    clinic_id: jeton.clinic_id,
    actif: { $ne: false }
  }).lean();
  if (!employe) return null;

  const [creneaux, patients] = await Promise.all([
    recupererCreneauxAbonnement(employe.id, jeton.clinic_id),
    Patient.find({ clinic_id: jeton.clinic_id }).lean()
  ]);

  const now = new Date().toISOString();
  await CalendarSyncToken.updateOne({ id: jeton.id }, { last_accessed_at: now });

  return genererFluxIcsAbonnement({
    creneaux,
    patients,
    nomCalendrier: `SMR — ${employe.prenom} ${employe.nom}`
  });
}

module.exports = {
  obtenirStatutSync,
  creerOuRegenererJeton,
  revoquerJeton,
  validerEtServirFlux,
  construireUrlPublique
};
