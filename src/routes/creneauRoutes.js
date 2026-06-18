const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readAll, withWriteLock } = require('../utils/jsonStore');
const { genererPlanningHebdomadaire } = require('../services/planningService');
const { seChevauchent, lundiDeLaSemaine, lesCinqJoursDeLaSemaine } = require('../utils/dateUtils');
const { genererFichierIcs } = require('../utils/icsUtils');
const { TEMPS_PLANNING } = require('../constants');

// GET /api/creneaux/export/ics?date_debut=...&date_fin=...
// Exporte uniquement l'agenda du professionnel connecté (semaine affichée par défaut).
router.get('/export/ics', (req, res) => {
  let { date_debut, date_fin } = req.query;

  if (!date_debut || !date_fin) {
    const { formaterDateLocale } = require('../utils/dateUtils');
    const lundi = lundiDeLaSemaine(formaterDateLocale(new Date()));
    const jours = lesCinqJoursDeLaSemaine(lundi);
    date_debut = jours[0].date;
    date_fin = jours[4].date;
  }

  const employes = readAll('employes');
  const patients = readAll('patients');
  const employe = employes.find(e => e.id === req.utilisateur.id);

  if (!employe) {
    return res.status(401).json({ erreur: 'Compte introuvable.' });
  }

  const creneaux = readAll('creneaux').filter(c =>
    c.employe_id === req.utilisateur.id &&
    c.statut !== 'ANNULE' &&
    c.date >= date_debut &&
    c.date <= date_fin
  );

  const ics = genererFichierIcs({
    creneaux,
    patients,
    employe,
    nomCalendrier: `SMR — ${employe.prenom} ${employe.nom}`
  });

  const nomFichier = `agenda-smr-${date_debut}.ics`;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
  res.send(ics);
});

// GET /api/creneaux?employe_id=...&patient_id=...&date_debut=...&date_fin=...
router.get('/', (req, res) => {
  const { employe_id, patient_id, date_debut, date_fin } = req.query;
  let creneaux = readAll('creneaux');

  if (employe_id) creneaux = creneaux.filter(c => c.employe_id === employe_id);
  if (patient_id) creneaux = creneaux.filter(c => c.patient_id === patient_id);
  if (date_debut) creneaux = creneaux.filter(c => c.date >= date_debut);
  if (date_fin) creneaux = creneaux.filter(c => c.date <= date_fin);

  res.json(creneaux);
});

// Vérifie qu'un créneau manuel ne crée pas de conflit pro ou patient
function verifierConflit(creneauxExistants, candidat, idAIgnorer = null) {
  const conflitsPro = creneauxExistants.filter(c =>
    c.id !== idAIgnorer &&
    c.employe_id === candidat.employe_id &&
    c.date === candidat.date &&
    c.statut !== 'ANNULE' &&
    seChevauchent(c.heure_debut, c.heure_fin, candidat.heure_debut, candidat.heure_fin)
  );
  const conflitsPatient = creneauxExistants.filter(c =>
    c.id !== idAIgnorer &&
    c.patient_id === candidat.patient_id &&
    c.date === candidat.date &&
    c.statut !== 'ANNULE' &&
    seChevauchent(c.heure_debut, c.heure_fin, candidat.heure_debut, candidat.heure_fin)
  );
  if (conflitsPro.length > 0) return 'Le professionnel a déjà un rendez-vous sur ce créneau.';
  if (conflitsPatient.length > 0) return 'Le patient a déjà un rendez-vous sur ce créneau.';
  return null;
}

// POST /api/creneaux - création manuelle d'un créneau (avec vérification stricte des conflits)
router.post('/', async (req, res) => {
  const { patient_id, employe_id, role, date, heure_debut, heure_fin, besoin_soin_id } = req.body;

  if (!patient_id || !employe_id || !date || !heure_debut || !heure_fin) {
    return res.status(400).json({ erreur: 'patient_id, employe_id, date, heure_debut et heure_fin sont requis.' });
  }

  const dureeMin = (parseInt(heure_fin.split(':')[0]) * 60 + parseInt(heure_fin.split(':')[1])) -
                    (parseInt(heure_debut.split(':')[0]) * 60 + parseInt(heure_debut.split(':')[1]));
  if (dureeMin !== TEMPS_PLANNING.DUREE_SEANCE_MIN) {
    return res.status(400).json({ erreur: `Un créneau doit durer exactement ${TEMPS_PLANNING.DUREE_SEANCE_MIN} minutes.` });
  }

  try {
    const nouveauCreneau = await withWriteLock('creneaux', async (creneaux) => {
      const candidat = { patient_id, employe_id, date, heure_debut, heure_fin };
      const erreurConflit = verifierConflit(creneaux, candidat);
      if (erreurConflit) throw new Error(erreurConflit);

      const creneau = {
        id: uuidv4(),
        patient_id, employe_id,
        besoin_soin_id: besoin_soin_id || null,
        role: role || null,
        date, heure_debut, heure_fin,
        statut: 'PLANIFIE',
        genere_auto: false
      };
      return { data: [...creneaux, creneau], returnValue: creneau };
    });

    res.status(201).json(nouveauCreneau);
  } catch (err) {
    res.status(409).json({ erreur: err.message });
  }
});

// PUT /api/creneaux/:id - déplacer/modifier un créneau (re-vérifie les conflits)
router.put('/:id', async (req, res) => {
  const { date, heure_debut, heure_fin, statut } = req.body;

  try {
    const resultat = await withWriteLock('creneaux', async (creneaux) => {
      const index = creneaux.findIndex(c => c.id === req.params.id);
      if (index === -1) throw new Error('NOT_FOUND');

      const existant = creneaux[index];
      const candidat = {
        patient_id: existant.patient_id,
        employe_id: existant.employe_id,
        date: date || existant.date,
        heure_debut: heure_debut || existant.heure_debut,
        heure_fin: heure_fin || existant.heure_fin
      };

      if (date || heure_debut || heure_fin) {
        const erreurConflit = verifierConflit(creneaux, candidat, existant.id);
        if (erreurConflit) throw new Error(erreurConflit);
      }

      creneaux[index] = {
        ...existant,
        ...candidat,
        ...(statut !== undefined && { statut })
      };
      return { data: creneaux, returnValue: creneaux[index] };
    });

    res.json(resultat);
  } catch (err) {
    if (err.message === 'NOT_FOUND') return res.status(404).json({ erreur: 'Créneau introuvable.' });
    res.status(409).json({ erreur: err.message });
  }
});

// DELETE /api/creneaux/:id - annule le créneau (conserve l'historique, ne supprime pas la ligne)
router.delete('/:id', async (req, res) => {
  const resultat = await withWriteLock('creneaux', async (creneaux) => {
    const index = creneaux.findIndex(c => c.id === req.params.id);
    if (index === -1) return { data: creneaux, returnValue: null };
    creneaux[index] = { ...creneaux[index], statut: 'ANNULE' };
    return { data: creneaux, returnValue: creneaux[index] };
  });
  if (!resultat) return res.status(404).json({ erreur: 'Créneau introuvable.' });
  res.json({ message: 'Créneau annulé.' });
});

// ===========================================================
// Génération automatique du planning hebdomadaire
// ===========================================================

// POST /api/creneaux/generer - lance l'algorithme pour la semaine de la date donnée
// Body : { date: "2026-06-22" } (n'importe quel jour de la semaine cible)
router.post('/generer', async (req, res) => {
  const { date } = req.body;
  if (!date) {
    return res.status(400).json({ erreur: 'Le champ date est requis (un jour quelconque de la semaine à planifier).' });
  }

  const lundi = lundiDeLaSemaine(date);
  const jours = lesCinqJoursDeLaSemaine(lundi);
  const datesSemaine = new Set(jours.map(j => j.date));
  const { planningGenere, conflits } = genererPlanningHebdomadaire(lundi, { remplacerSemaine: true });

  const creneauxSauvegardes = await withWriteLock('creneaux', async (creneauxActuels) => {
    const horsSemaine = creneauxActuels.filter(c => !datesSemaine.has(c.date));
    return { data: [...horsSemaine, ...planningGenere], returnValue: planningGenere };
  });

  res.json({
    message: `Planning régénéré pour la semaine du ${lundi} (ancien agenda de la semaine remplacé).`,
    lundi,
    creneaux_crees: creneauxSauvegardes.length,
    creneaux: creneauxSauvegardes,
    conflits
  });
});

module.exports = router;
