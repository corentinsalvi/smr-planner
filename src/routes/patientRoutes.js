const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Patient, Besoin } = require('../models');
const { ROLES } = require('../constants');
const { getClinicIdFromRequest } = require('../utils/clinicScope');
const requireRole = require('../middleware/requireRole');
const { GESTIONNAIRE_ROLES, DIRECTEUR_ROLES } = require('../constants');

const ROLES_GESTION = [...GESTIONNAIRE_ROLES, ...DIRECTEUR_ROLES];

async function enrichirPatient(patient) {
  const besoins = await Besoin.find({
    clinic_id: patient.clinic_id,
    patient_id: patient.id,
    actif: { $ne: false }
  }).lean();
  const obj = patient.toJSON ? patient.toJSON() : { ...patient };
  return { ...obj, besoins };
}

// GET /api/patients?statut=ACTIF
router.get('/', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const filtre = { clinic_id: clinicId };
  if (req.query.statut) filtre.statut = req.query.statut;

  const patients = await Patient.find(filtre).sort({ nom: 1, prenom: 1 });
  const enrichis = await Promise.all(patients.map(enrichirPatient));
  res.json(enrichis);
});

// GET /api/patients/:id
router.get('/:id', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const patient = await Patient.findOne({ id: req.params.id, clinic_id: clinicId });
  if (!patient) return res.status(404).json({ erreur: 'Patient introuvable.' });
  res.json(await enrichirPatient(patient));
});

// POST /api/patients (gestionnaires et directeur uniquement)
router.post('/', requireRole(...ROLES_GESTION), async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const { nom, prenom, date_naissance, besoins } = req.body;

  if (!nom || !prenom) {
    return res.status(400).json({ erreur: 'Le nom et le prénom sont requis.' });
  }

  const besoinsValides = Array.isArray(besoins) ? besoins : [];
  for (const b of besoinsValides) {
    if (!b.role || !ROLES[b.role]) {
      return res.status(400).json({ erreur: `Rôle inconnu : ${b.role}.` });
    }
  }

  const patient = await Patient.create({
    id: uuidv4(),
    clinic_id: clinicId,
    nom,
    prenom,
    date_naissance: date_naissance || null,
    statut: 'ACTIF',
    date_entree: new Date().toISOString().slice(0, 10),
    date_sortie_prevue: null
  });

  if (besoinsValides.length > 0) {
    await Besoin.insertMany(besoinsValides.map(b => ({
      id: uuidv4(),
      clinic_id: clinicId,
      patient_id: patient.id,
      role: b.role,
      seances_par_semaine: Number(b.seances_par_semaine) || 1,
      priorite: Number(b.priorite) || 5,
      professionnel_prefere_id: b.professionnel_prefere_id || null,
      actif: true
    })));
  }

  res.status(201).json(await enrichirPatient(patient));
});

// PUT /api/patients/:id
router.put('/:id', requireRole(...ROLES_GESTION), async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const { nom, prenom, date_naissance, statut } = req.body;

  const patient = await Patient.findOneAndUpdate(
    { id: req.params.id, clinic_id: clinicId },
    {
      ...(nom !== undefined && { nom }),
      ...(prenom !== undefined && { prenom }),
      ...(date_naissance !== undefined && { date_naissance }),
      ...(statut !== undefined && { statut })
    },
    { new: true }
  );

  if (!patient) return res.status(404).json({ erreur: 'Patient introuvable.' });
  res.json(await enrichirPatient(patient));
});

// DELETE /api/patients/:id — archive le patient
router.delete('/:id', requireRole(...ROLES_GESTION), async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const patient = await Patient.findOneAndUpdate(
    { id: req.params.id, clinic_id: clinicId },
    { statut: 'ARCHIVE' },
    { new: true }
  );

  if (!patient) return res.status(404).json({ erreur: 'Patient introuvable.' });
  res.json({ message: 'Patient archivé.' });
});

// PUT /api/patients/:id/besoins — remplace les besoins actifs du patient
router.put('/:id/besoins', requireRole(...ROLES_GESTION), async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const { besoins } = req.body;

  if (!Array.isArray(besoins)) {
    return res.status(400).json({ erreur: 'Le champ besoins doit être un tableau.' });
  }

  const patient = await Patient.findOne({ id: req.params.id, clinic_id: clinicId });
  if (!patient) return res.status(404).json({ erreur: 'Patient introuvable.' });

  for (const b of besoins) {
    if (!b.role || !ROLES[b.role]) {
      return res.status(400).json({ erreur: `Rôle inconnu : ${b.role}.` });
    }
  }

  await Besoin.deleteMany({ clinic_id: clinicId, patient_id: req.params.id });

  if (besoins.length > 0) {
    await Besoin.insertMany(besoins.map(b => ({
      id: uuidv4(),
      clinic_id: clinicId,
      patient_id: req.params.id,
      role: b.role,
      seances_par_semaine: Number(b.seances_par_semaine) || 1,
      priorite: Number(b.priorite) || 5,
      professionnel_prefere_id: b.professionnel_prefere_id || null,
      actif: true
    })));
  }

  res.json(await enrichirPatient(patient));
});

module.exports = router;
