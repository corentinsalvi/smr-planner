const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { readAll, withWriteLock } = require('../utils/jsonStore');
const { hashMotDePasse } = require('../services/authService');
const { ROLES, JOURS_SEMAINE } = require('../constants');
const { plageHoraireValide } = require('../utils/dateUtils');

// GET /api/employes - liste tous les employés (sans les hash de mot de passe)
router.get('/', (req, res) => {
  const employes = readAll('employes').map(({ mot_de_passe_hash, ...e }) => e);
  res.json(employes);
});

// GET /api/employes/referentiel-roles - liste des métiers et couleurs (utile pour le front)
router.get('/referentiel-roles', (req, res) => {
  res.json({ roles: ROLES, jours: JOURS_SEMAINE });
});

// GET /api/employes/:id
router.get('/:id', (req, res) => {
  const employe = readAll('employes').find(e => e.id === req.params.id);
  if (!employe) return res.status(404).json({ erreur: 'Employé introuvable.' });
  const { mot_de_passe_hash, ...sansHash } = employe;
  res.json(sansHash);
});

// POST /api/employes - création d'un employé
router.post('/', async (req, res) => {
  const { nom, prenom, email, mot_de_passe, role } = req.body;

  if (!nom || !prenom || !email || !mot_de_passe || !role) {
    return res.status(400).json({ erreur: 'Tous les champs (nom, prénom, email, mot de passe, rôle) sont requis.' });
  }
  if (!ROLES[role]) {
    return res.status(400).json({ erreur: `Rôle inconnu : ${role}.` });
  }

  try {
    const resultat = await withWriteLock('employes', async (employes) => {
      if (employes.some(e => e.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('EMAIL_EXISTANT');
      }
      const mot_de_passe_hash = await hashMotDePasse(mot_de_passe);
      const nouvel_employe = {
        id: uuidv4(),
        nom, prenom, email, mot_de_passe_hash, role,
        actif: true,
        created_at: new Date().toISOString()
      };
      return { data: [...employes, nouvel_employe], returnValue: nouvel_employe };
    });

    const { mot_de_passe_hash, ...sansHash } = resultat;
    res.status(201).json(sansHash);
  } catch (err) {
    if (err.message === 'EMAIL_EXISTANT') {
      return res.status(409).json({ erreur: 'Un employé avec cet email existe déjà.' });
    }
    console.error(err);
    res.status(500).json({ erreur: 'Erreur lors de la création de l\'employé.' });
  }
});

// PUT /api/employes/:id - mise à jour des infos générales (hors mot de passe)
router.put('/:id', async (req, res) => {
  const { nom, prenom, email, role, actif } = req.body;

  const resultat = await withWriteLock('employes', async (employes) => {
    const index = employes.findIndex(e => e.id === req.params.id);
    if (index === -1) return { data: employes, returnValue: null };

    employes[index] = {
      ...employes[index],
      ...(nom !== undefined && { nom }),
      ...(prenom !== undefined && { prenom }),
      ...(email !== undefined && { email }),
      ...(role !== undefined && { role }),
      ...(actif !== undefined && { actif })
    };
    return { data: employes, returnValue: employes[index] };
  });

  if (!resultat) return res.status(404).json({ erreur: 'Employé introuvable.' });
  const { mot_de_passe_hash, ...sansHash } = resultat;
  res.json(sansHash);
});

// DELETE /api/employes/:id - désactive l'employé (soft delete, ne supprime pas l'historique)
router.delete('/:id', async (req, res) => {
  const resultat = await withWriteLock('employes', async (employes) => {
    const index = employes.findIndex(e => e.id === req.params.id);
    if (index === -1) return { data: employes, returnValue: null };
    employes[index] = { ...employes[index], actif: false };
    return { data: employes, returnValue: employes[index] };
  });

  if (!resultat) return res.status(404).json({ erreur: 'Employé introuvable.' });
  res.json({ message: 'Employé désactivé.' });
});

// ===========================================================
// Disponibilités horaires (plages de travail hebdomadaires)
// ===========================================================

// GET /api/employes/:id/disponibilites
router.get('/:id/disponibilites', (req, res) => {
  const dispos = readAll('disponibilites').filter(d => d.employe_id === req.params.id);
  res.json(dispos);
});

// PUT /api/employes/:id/disponibilites - remplace entièrement les disponibilités de l'employé
// Body attendu : { disponibilites: [{ jour_semaine, heure_debut, heure_fin }, ...] }
router.put('/:id/disponibilites', async (req, res) => {
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
  await withWriteLock('disponibilites', async (toutes) => {
    const autresEmployes = toutes.filter(d => d.employe_id !== employeId);
    const nouvelles = disponibilites.map(d => ({
      id: uuidv4(),
      employe_id: employeId,
      jour_semaine: d.jour_semaine,
      heure_debut: d.heure_debut,
      heure_fin: d.heure_fin
    }));
    return { data: [...autresEmployes, ...nouvelles], returnValue: nouvelles };
  });

  const dispos = readAll('disponibilites').filter(d => d.employe_id === employeId);
  res.json(dispos);
});

module.exports = router;
