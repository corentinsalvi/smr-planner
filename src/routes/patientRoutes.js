const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readAll, withWriteLock } = require('../utils/jsonStore');
const { ROLES } = require('../constants');

function enrichirPatient(patient) {
  const besoins = readAll('besoins').filter(b => b.patient_id === patient.id && b.actif !== false);
  return { ...patient, besoins };
}

// GET /api/patients?statut=ACTIF
router.get('/', (req, res) => {
  const { statut } = req.query;
  let patients = readAll('patients');
  if (statut) patients = patients.filter(p => p.statut === statut);
  res.json(patients.map(enrichirPatient));
});

// GET /api/patients/:id
router.get('/:id', (req, res) => {
  const patient = readAll('patients').find(p => p.id === req.params.id);
  if (!patient) return res.status(404).json({ erreur: 'Patient introuvable.' });
  res.json(enrichirPatient(patient));
});

// POST /api/patients
router.post('/', async (req, res) => {
  const { nom, prenom, date_naissance, besoins } = req.body;
  if (!nom || !prenom) {
    return res.status(400).json({ erreur: 'Le nom et le prénom sont requis.' });
  }

  const patient = {
    id: uuidv4(),
    nom,
    prenom,
    date_naissance: date_naissance || null,
    statut: 'ACTIF',
    date_entree: new Date().toISOString().slice(0, 10),
    date_sortie_prevue: null,
    created_at: new Date().toISOString()
  };

  const besoinsValides = Array.isArray(besoins) ? besoins : [];
  for (const b of besoinsValides) {
    if (!b.role || !ROLES[b.role]) {
      return res.status(400).json({ erreur: `Rôle inconnu : ${b.role}.` });
    }
  }

  await withWriteLock('patients', async patients => ({
    data: [...patients, patient],
    returnValue: patient
  }));

  if (besoinsValides.length > 0) {
    await withWriteLock('besoins', async tous => {
      const nouveaux = besoinsValides.map(b => ({
        id: uuidv4(),
        patient_id: patient.id,
        role: b.role,
        seances_par_semaine: Number(b.seances_par_semaine) || 1,
        priorite: Number(b.priorite) || 5,
        professionnel_prefere_id: b.professionnel_prefere_id || null,
        actif: true
      }));
      return { data: [...tous, ...nouveaux], returnValue: nouveaux };
    });
  }

  res.status(201).json(enrichirPatient(patient));
});

// PUT /api/patients/:id
router.put('/:id', async (req, res) => {
  const { nom, prenom, date_naissance, statut } = req.body;

  const resultat = await withWriteLock('patients', async patients => {
    const index = patients.findIndex(p => p.id === req.params.id);
    if (index === -1) return { data: patients, returnValue: null };
    patients[index] = {
      ...patients[index],
      ...(nom !== undefined && { nom }),
      ...(prenom !== undefined && { prenom }),
      ...(date_naissance !== undefined && { date_naissance }),
      ...(statut !== undefined && { statut })
    };
    return { data: patients, returnValue: patients[index] };
  });

  if (!resultat) return res.status(404).json({ erreur: 'Patient introuvable.' });
  res.json(enrichirPatient(resultat));
});

// DELETE /api/patients/:id — archive le patient
router.delete('/:id', async (req, res) => {
  const resultat = await withWriteLock('patients', async patients => {
    const index = patients.findIndex(p => p.id === req.params.id);
    if (index === -1) return { data: patients, returnValue: null };
    patients[index] = { ...patients[index], statut: 'ARCHIVE' };
    return { data: patients, returnValue: patients[index] };
  });

  if (!resultat) return res.status(404).json({ erreur: 'Patient introuvable.' });
  res.json({ message: 'Patient archivé.' });
});

// PUT /api/patients/:id/besoins — remplace les besoins actifs du patient
router.put('/:id/besoins', async (req, res) => {
  const { besoins } = req.body;
  if (!Array.isArray(besoins)) {
    return res.status(400).json({ erreur: 'Le champ besoins doit être un tableau.' });
  }

  const patient = readAll('patients').find(p => p.id === req.params.id);
  if (!patient) return res.status(404).json({ erreur: 'Patient introuvable.' });

  for (const b of besoins) {
    if (!b.role || !ROLES[b.role]) {
      return res.status(400).json({ erreur: `Rôle inconnu : ${b.role}.` });
    }
  }

  await withWriteLock('besoins', async tous => {
    const autres = tous.filter(b => b.patient_id !== req.params.id);
    const nouveaux = besoins.map(b => ({
      id: uuidv4(),
      patient_id: req.params.id,
      role: b.role,
      seances_par_semaine: Number(b.seances_par_semaine) || 1,
      priorite: Number(b.priorite) || 5,
      professionnel_prefere_id: b.professionnel_prefere_id || null,
      actif: true
    }));
    return { data: [...autres, ...nouveaux], returnValue: nouveaux };
  });

  res.json(enrichirPatient(patient));
});

module.exports = router;
