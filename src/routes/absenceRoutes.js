const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { Absence, Employe } = require('../models');
const { TYPES_ABSENCE } = require('../utils/absenceUtils');
const { plageHoraireValide } = require('../utils/dateUtils');
const { GESTIONNAIRE_ROLES, ROLES_VUE_GLOBALE } = require('../constants');
const { getClinicIdFromRequest } = require('../utils/clinicScope');

const GESTIONNAIRES = new Set(GESTIONNAIRE_ROLES);
const VUE_GLOBALE = new Set(ROLES_VUE_GLOBALE);

function peutGererAbsences(utilisateur, employeId) {
  return utilisateur.id === employeId || GESTIONNAIRES.has(utilisateur.role);
}

// GET /api/absences?employe_id=&date_debut=&date_fin=
router.get('/', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const { employe_id, date_debut, date_fin } = req.query;
  const filtre = { clinic_id: clinicId };

  if (employe_id) {
    filtre.employe_id = employe_id;
  } else if (!VUE_GLOBALE.has(req.utilisateur.role)) {
    filtre.employe_id = req.utilisateur.id;
  }

  if (date_debut) filtre.date_fin = { $gte: date_debut };
  if (date_fin) filtre.date_debut = { ...(filtre.date_debut || {}), $lte: date_fin };

  const absences = await Absence.find(filtre).sort({ date_debut: 1 });
  res.json(absences.map(a => a.toJSON()));
});

// POST /api/absences
router.post('/', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const {
    employe_id,
    type,
    date_debut,
    date_fin,
    journee_entiere = true,
    heure_debut,
    heure_fin,
    commentaire
  } = req.body;

  const employeId = employe_id || req.utilisateur.id;

  if (!peutGererAbsences(req.utilisateur, employeId)) {
    return res.status(403).json({ erreur: 'Vous ne pouvez pas enregistrer d\'absence pour ce professionnel.' });
  }

  if (!type || !date_debut || !date_fin) {
    return res.status(400).json({ erreur: 'type, date_debut et date_fin sont requis.' });
  }
  if (!TYPES_ABSENCE.includes(type)) {
    return res.status(400).json({ erreur: `Type d'absence invalide. Valeurs : ${TYPES_ABSENCE.join(', ')}` });
  }
  if (date_fin < date_debut) {
    return res.status(400).json({ erreur: 'La date de fin doit être postérieure ou égale à la date de début.' });
  }

  const employe = await Employe.findOne({
    id: employeId,
    clinic_id: clinicId,
    actif: { $ne: false }
  });
  if (!employe) {
    return res.status(404).json({ erreur: 'Professionnel introuvable ou inactif.' });
  }

  if (!journee_entiere) {
    if (!heure_debut || !heure_fin) {
      return res.status(400).json({ erreur: 'heure_debut et heure_fin sont requis pour une absence partielle.' });
    }
    const erreurPlage = plageHoraireValide(heure_debut, heure_fin);
    if (erreurPlage) {
      return res.status(400).json({ erreur: erreurPlage });
    }
    if (date_debut !== date_fin) {
      return res.status(400).json({ erreur: 'Une absence partielle ne peut couvrir qu\'une seule journée.' });
    }
  }

  try {
    const nouvelle = await Absence.create({
      id: uuidv4(),
      clinic_id: clinicId,
      employe_id: employeId,
      type,
      date_debut,
      date_fin,
      journee_entiere: journee_entiere !== false,
      heure_debut: journee_entiere !== false ? null : heure_debut,
      heure_fin: journee_entiere !== false ? null : heure_fin,
      commentaire: commentaire?.trim() || '',
      created_by: req.utilisateur.id
    });

    res.status(201).json(nouvelle.toJSON());
  } catch (err) {
    console.error(err);
    res.status(500).json({ erreur: 'Erreur lors de l\'enregistrement de l\'absence.' });
  }
});

// DELETE /api/absences/:id
router.delete('/:id', async (req, res) => {
  const clinicId = getClinicIdFromRequest(req);
  const absence = await Absence.findOne({ id: req.params.id, clinic_id: clinicId });

  if (!absence) {
    return res.status(404).json({ erreur: 'Absence introuvable.' });
  }
  if (!peutGererAbsences(req.utilisateur, absence.employe_id)) {
    return res.status(403).json({ erreur: 'Vous ne pouvez pas supprimer cette absence.' });
  }

  await Absence.deleteOne({ id: req.params.id, clinic_id: clinicId });
  res.json({ message: 'Absence supprimée.' });
});

module.exports = router;
