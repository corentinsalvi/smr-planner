const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Employe, Disponibilite } = require('../models');
const { hashMotDePasse } = require('../services/authService');
const { ROLES, JOURS_SEMAINE } = require('../constants');
const { plageHoraireValide } = require('../utils/dateUtils');
const { getClinicIdFromRequest } = require('../utils/clinicScope');

function sansMotDePasse(employe) {
  const obj = employe.toJSON ? employe.toJSON() : { ...employe };
  delete obj.mot_de_passe_hash;
  return obj;
}

// GET /api/employes - liste tous les employés (sans les hash de mot de passe)
router.get('/', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const employes = await Employe.find({ clinic_id: clinicId }).sort({ nom: 1, prenom: 1 });
  res.json(employes.map(sansMotDePasse));
});

// GET /api/employes/referentiel-roles - liste des métiers et couleurs (utile pour le front)
router.get('/referentiel-roles', (req, res) => {
  res.json({ roles: ROLES, jours: JOURS_SEMAINE });
});

// GET /api/employes/:id
router.get('/:id', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const employe = await Employe.findOne({ id: req.params.id, clinic_id: clinicId });
  if (!employe) return res.status(404).json({ erreur: 'Employé introuvable.' });
  res.json(sansMotDePasse(employe));
});

// POST /api/employes - création d'un employé
router.post('/', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const { nom, prenom, email, mot_de_passe, role } = req.body;

  if (!nom || !prenom || !email || !mot_de_passe || !role) {
    return res.status(400).json({ erreur: 'Tous les champs (nom, prénom, email, mot de passe, rôle) sont requis.' });
  }
  if (!ROLES[role]) {
    return res.status(400).json({ erreur: `Rôle inconnu : ${role}.` });
  }

  try {
    const existant = await Employe.findOne({
      clinic_id: clinicId,
      email: email.toLowerCase()
    });
    if (existant) {
      return res.status(409).json({ erreur: 'Un employé avec cet email existe déjà.' });
    }

    const mot_de_passe_hash = await hashMotDePasse(mot_de_passe);
    const nouvelEmploye = await Employe.create({
      id: uuidv4(),
      clinic_id: clinicId,
      nom,
      prenom,
      email: email.toLowerCase(),
      mot_de_passe_hash,
      role,
      actif: true
    });

    res.status(201).json(sansMotDePasse(nouvelEmploye));
  } catch (err) {
    console.error(err);
    res.status(500).json({ erreur: 'Erreur lors de la création de l\'employé.' });
  }
});

// PUT /api/employes/:id - mise à jour des infos générales (hors mot de passe)
router.put('/:id', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const { nom, prenom, email, role, actif } = req.body;

  const employe = await Employe.findOneAndUpdate(
    { id: req.params.id, clinic_id: clinicId },
    {
      ...(nom !== undefined && { nom }),
      ...(prenom !== undefined && { prenom }),
      ...(email !== undefined && { email: email.toLowerCase() }),
      ...(role !== undefined && { role }),
      ...(actif !== undefined && { actif })
    },
    { new: true }
  );

  if (!employe) return res.status(404).json({ erreur: 'Employé introuvable.' });
  res.json(sansMotDePasse(employe));
});

// DELETE /api/employes/:id - désactive l'employé (soft delete)
router.delete('/:id', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const employe = await Employe.findOneAndUpdate(
    { id: req.params.id, clinic_id: clinicId },
    { actif: false },
    { new: true }
  );

  if (!employe) return res.status(404).json({ erreur: 'Employé introuvable.' });
  res.json({ message: 'Employé désactivé.' });
});

// GET /api/employes/:id/disponibilites
router.get('/:id/disponibilites', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const dispos = await Disponibilite.find({
    clinic_id: clinicId,
    employe_id: req.params.id
  }).sort({ jour_semaine: 1, heure_debut: 1 });
  res.json(dispos.map(d => d.toJSON()));
});

// PUT /api/employes/:id/disponibilites - remplace entièrement les disponibilités
router.put('/:id/disponibilites', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const { disponibilites } = req.body;

  if (!Array.isArray(disponibilites)) {
    return res.status(400).json({ erreur: 'Le champ disponibilites doit être un tableau.' });
  }

  for (const d of disponibilites) {
    if (!d.jour_semaine || !d.heure_debut || !d.heure_fin) {
      return res.status(400).json({ erreur: 'Chaque disponibilité doit avoir jour_semaine, heure_debut et heure_fin.' });
    }
    const erreurPlage = plageHoraireValide(d.heure_debut, d.heure_fin);
    if (erreurPlage) {
      return res.status(400).json({ erreur: erreurPlage });
    }
  }

  const employeId = req.params.id;
  await Disponibilite.deleteMany({ clinic_id: clinicId, employe_id: employeId });

  if (disponibilites.length > 0) {
    await Disponibilite.insertMany(disponibilites.map(d => ({
      id: uuidv4(),
      clinic_id: clinicId,
      employe_id: employeId,
      jour_semaine: d.jour_semaine,
      heure_debut: d.heure_debut,
      heure_fin: d.heure_fin
    })));
  }

  const dispos = await Disponibilite.find({ clinic_id: clinicId, employe_id: employeId });
  res.json(dispos.map(d => d.toJSON()));
});

module.exports = router;
