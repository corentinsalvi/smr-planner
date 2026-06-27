const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Employe, Patient, Creneau, Absence } = require('../models');
const { genererPlanningHebdomadaire } = require('../services/planningService');
const { seChevauchent, lundiDeLaSemaine, lesCinqJoursDeLaSemaine } = require('../utils/dateUtils');
const { genererFichierIcs } = require('../utils/icsUtils');
const { TEMPS_PLANNING } = require('../constants');
const { estProAbsent } = require('../utils/absenceUtils');
const { getClinicIdFromRequest } = require('../utils/clinicScope');
const { limiteurPlanning } = require('../middleware/rateLimit');

// GET /api/creneaux/export/ics?date_debut=...&date_fin=...
router.get('/export/ics', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  let { date_debut, date_fin } = req.query;

  if (!date_debut || !date_fin) {
    const { formaterDateLocale } = require('../utils/dateUtils');
    const lundi = lundiDeLaSemaine(formaterDateLocale(new Date()));
    const jours = lesCinqJoursDeLaSemaine(lundi);
    date_debut = jours[0].date;
    date_fin = jours[4].date;
  }

  const employe = await Employe.findOne({ id: req.utilisateur.id, clinic_id: clinicId });
  if (!employe) {
    return res.status(401).json({ erreur: 'Compte introuvable.' });
  }

  const [creneaux, patients] = await Promise.all([
    Creneau.find({
      clinic_id: clinicId,
      employe_id: req.utilisateur.id,
      statut: { $ne: 'ANNULE' },
      date: { $gte: date_debut, $lte: date_fin }
    }).lean(),
    Patient.find({ clinic_id: clinicId }).lean()
  ]);

  const ics = genererFichierIcs({
    creneaux,
    patients,
    employe: employe.toJSON(),
    nomCalendrier: `SMR — ${employe.prenom} ${employe.nom}`
  });

  const nomFichier = `agenda-smr-${date_debut}.ics`;
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
  res.send(ics);
});

// GET /api/creneaux?employe_id=...&patient_id=...&date_debut=...&date_fin=...
router.get('/', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const { employe_id, patient_id, date_debut, date_fin } = req.query;
  const filtre = { clinic_id: clinicId };

  if (employe_id) filtre.employe_id = employe_id;
  if (patient_id) filtre.patient_id = patient_id;
  if (date_debut || date_fin) {
    filtre.date = {};
    if (date_debut) filtre.date.$gte = date_debut;
    if (date_fin) filtre.date.$lte = date_fin;
  }

  const creneaux = await Creneau.find(filtre).sort({ date: 1, heure_debut: 1 });
  res.json(creneaux.map(c => c.toJSON()));
});

async function verifierConflit(clinicId, candidat, idAIgnorer = null) {
  const [creneauxExistants, absences] = await Promise.all([
    Creneau.find({ clinic_id: clinicId, date: candidat.date }).lean(),
    Absence.find({ clinic_id: clinicId, employe_id: candidat.employe_id }).lean()
  ]);

  if (estProAbsent(absences, candidat.employe_id, candidat.date, candidat.heure_debut, candidat.heure_fin)) {
    return 'Le professionnel est absent sur ce créneau.';
  }

  const conflitsPro = creneauxExistants.filter(c =>
    c.id !== idAIgnorer &&
    c.employe_id === candidat.employe_id &&
    c.statut !== 'ANNULE' &&
    seChevauchent(c.heure_debut, c.heure_fin, candidat.heure_debut, candidat.heure_fin)
  );

  if (conflitsPro.length > 0) return 'Le professionnel a déjà un rendez-vous sur ce créneau.';

  if (candidat.patient_id) {
    const conflitsPatient = creneauxExistants.filter(c =>
      c.id !== idAIgnorer &&
      c.patient_id === candidat.patient_id &&
      c.statut !== 'ANNULE' &&
      seChevauchent(c.heure_debut, c.heure_fin, candidat.heure_debut, candidat.heure_fin)
    );
    if (conflitsPatient.length > 0) return 'Le patient a déjà un rendez-vous sur ce créneau.';
  }

  return null;
}

// POST /api/creneaux - création manuelle
router.post('/', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const { patient_id, employe_id, role, date, heure_debut, heure_fin, besoin_soin_id, notes } = req.body;

  if (!employe_id || !date || !heure_debut || !heure_fin) {
    return res.status(400).json({ erreur: 'employe_id, date, heure_debut et heure_fin sont requis.' });
  }

  const employe = await Employe.findOne({ id: employe_id, clinic_id: clinicId });
  if (!employe) {
    return res.status(404).json({ erreur: 'Professionnel introuvable.' });
  }

  const creneauPersoDirecteur = employe.role === 'DIRECTEUR' && !patient_id;
  if (creneauPersoDirecteur) {
    if (!notes?.trim()) {
      return res.status(400).json({ erreur: 'Une description est requise pour ce créneau.' });
    }
  } else if (!patient_id) {
    return res.status(400).json({ erreur: 'patient_id est requis.' });
  }

  const dureeMin = (parseInt(heure_fin.split(':')[0]) * 60 + parseInt(heure_fin.split(':')[1])) -
                    (parseInt(heure_debut.split(':')[0]) * 60 + parseInt(heure_debut.split(':')[1]));
  if (dureeMin !== TEMPS_PLANNING.DUREE_SEANCE_MIN) {
    return res.status(400).json({ erreur: `Un créneau doit durer exactement ${TEMPS_PLANNING.DUREE_SEANCE_MIN} minutes.` });
  }

  try {
    const candidat = { patient_id: patient_id || null, employe_id, date, heure_debut, heure_fin };
    const erreurConflit = await verifierConflit(clinicId, candidat);
    if (erreurConflit) {
      return res.status(409).json({ erreur: erreurConflit });
    }

    const creneau = await Creneau.create({
      id: uuidv4(),
      clinic_id: clinicId,
      patient_id: patient_id || null,
      employe_id,
      besoin_soin_id: besoin_soin_id || null,
      role: role || employe.role || null,
      date,
      heure_debut,
      heure_fin,
      statut: 'PLANIFIE',
      genere_auto: false,
      notes: notes?.trim() || ''
    });

    res.status(201).json(creneau.toJSON());
  } catch (err) {
    res.status(409).json({ erreur: err.message });
  }
});

// PUT /api/creneaux/:id
router.put('/:id', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const { date, heure_debut, heure_fin, statut } = req.body;

  try {
    const existant = await Creneau.findOne({ id: req.params.id, clinic_id: clinicId });
    if (!existant) return res.status(404).json({ erreur: 'Créneau introuvable.' });

    const candidat = {
      patient_id: existant.patient_id,
      employe_id: existant.employe_id,
      date: date || existant.date,
      heure_debut: heure_debut || existant.heure_debut,
      heure_fin: heure_fin || existant.heure_fin
    };

    if (date || heure_debut || heure_fin) {
      const erreurConflit = await verifierConflit(clinicId, candidat, existant.id);
      if (erreurConflit) return res.status(409).json({ erreur: erreurConflit });
    }

    if (date !== undefined) existant.date = date;
    if (heure_debut !== undefined) existant.heure_debut = heure_debut;
    if (heure_fin !== undefined) existant.heure_fin = heure_fin;
    if (statut !== undefined) existant.statut = statut;

    await existant.save();
    res.json(existant.toJSON());
  } catch (err) {
    res.status(409).json({ erreur: err.message });
  }
});

// DELETE /api/creneaux/:id - annule le créneau
router.delete('/:id', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const creneau = await Creneau.findOneAndUpdate(
    { id: req.params.id, clinic_id: clinicId },
    { statut: 'ANNULE' },
    { new: true }
  );

  if (!creneau) return res.status(404).json({ erreur: 'Créneau introuvable.' });
  res.json({ message: 'Créneau annulé.' });
});

// POST /api/creneaux/generer - génère l'agenda du professionnel connecté
router.post('/generer', limiteurPlanning, async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const { date } = req.body;

  if (!date) {
    return res.status(400).json({ erreur: 'Le champ date est requis (un jour quelconque de la semaine à planifier).' });
  }

  const lundi = lundiDeLaSemaine(date);
  const jours = lesCinqJoursDeLaSemaine(lundi);
  const datesSemaine = jours.map(j => j.date);
  const employeId = req.utilisateur.id;

  const { planningGenere, conflits, erreur, employe } = await genererPlanningHebdomadaire(lundi, {
    remplacerSemaine: true,
    employeId,
    clinicId
  });

  if (erreur) {
    return res.status(404).json({ erreur });
  }

  await Creneau.deleteMany({
    clinic_id: clinicId,
    employe_id: employeId,
    date: { $in: datesSemaine }
  });

  if (planningGenere.length > 0) {
    await Creneau.insertMany(planningGenere.map(c => ({ ...c, clinic_id: clinicId })));
  }

  const nomPro = employe ? `${employe.prenom} ${employe.nom}` : 'Votre agenda';
  res.json({
    message: `${nomPro} : ${planningGenere.length} rendez-vous planifié(s) pour la semaine du ${lundi}.`,
    lundi,
    employe_id: employeId,
    creneaux_crees: planningGenere.length,
    creneaux: planningGenere,
    conflits
  });
});

module.exports = router;
