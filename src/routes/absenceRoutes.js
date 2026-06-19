const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readAll, withWriteLock } = require('../utils/jsonStore');
const { TYPES_ABSENCE } = require('../utils/absenceUtils');
const { plageHoraireValide } = require('../utils/dateUtils');

const GESTIONNAIRE_ROLES = new Set(['IDE_COORDINATRICE']);

function peutGererAbsences(utilisateur, employeId) {
  return utilisateur.id === employeId || GESTIONNAIRE_ROLES.has(utilisateur.role);
}

// GET /api/absences?employe_id=&date_debut=&date_fin=
router.get('/', (req, res) => {
  const { employe_id, date_debut, date_fin } = req.query;
  let absences = readAll('absences');

  if (employe_id) {
    if (!peutGererAbsences(req.utilisateur, employe_id)) {
      return res.status(403).json({ erreur: 'Accès non autorisé aux absences de ce professionnel.' });
    }
    absences = absences.filter(a => a.employe_id === employe_id);
  } else if (!GESTIONNAIRE_ROLES.has(req.utilisateur.role)) {
    absences = absences.filter(a => a.employe_id === req.utilisateur.id);
  }

  if (date_debut) {
    absences = absences.filter(a => a.date_fin >= date_debut);
  }
  if (date_fin) {
    absences = absences.filter(a => a.date_debut <= date_fin);
  }

  absences.sort((a, b) => a.date_debut.localeCompare(b.date_debut));
  res.json(absences);
});

// POST /api/absences
router.post('/', async (req, res) => {
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

  const employe = readAll('employes').find(e => e.id === employeId && e.actif !== false);
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
    const nouvelle = await withWriteLock('absences', async (absences) => {
      const absence = {
        id: uuidv4(),
        employe_id: employeId,
        type,
        date_debut,
        date_fin,
        journee_entiere: journee_entiere !== false,
        heure_debut: journee_entiere !== false ? null : heure_debut,
        heure_fin: journee_entiere !== false ? null : heure_fin,
        commentaire: commentaire?.trim() || '',
        created_at: new Date().toISOString(),
        created_by: req.utilisateur.id
      };
      return { data: [...absences, absence], returnValue: absence };
    });

    res.status(201).json(nouvelle);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erreur: 'Erreur lors de l\'enregistrement de l\'absence.' });
  }
});

// DELETE /api/absences/:id
router.delete('/:id', async (req, res) => {
  const absences = readAll('absences');
  const absence = absences.find(a => a.id === req.params.id);
  if (!absence) {
    return res.status(404).json({ erreur: 'Absence introuvable.' });
  }
  if (!peutGererAbsences(req.utilisateur, absence.employe_id)) {
    return res.status(403).json({ erreur: 'Vous ne pouvez pas supprimer cette absence.' });
  }

  await withWriteLock('absences', async (toutes) => ({
    data: toutes.filter(a => a.id !== req.params.id),
    returnValue: true
  }));

  res.json({ message: 'Absence supprimée.' });
});

module.exports = router;
