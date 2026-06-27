const express = require('express');
const router = express.Router();
const { Employe } = require('../models');
const { verifierMotDePasse, genererToken } = require('../services/authService');
const { limiteurAuth } = require('../middleware/rateLimit');

function sansMotDePasse(employe) {
  const obj = employe.toJSON ? employe.toJSON() : { ...employe };
  delete obj.mot_de_passe_hash;
  return obj;
}

// POST /api/auth/login
router.post('/login', limiteurAuth, async (req, res) => {
  const { email, mot_de_passe } = req.body;

  if (!email || !mot_de_passe) {
    return res.status(400).json({ erreur: 'Email et mot de passe sont requis.' });
  }

  const employe = await Employe.findOne({
    email: email.toLowerCase(),
    actif: { $ne: false }
  });

  if (!employe) {
    return res.status(401).json({ erreur: 'Identifiants incorrects.' });
  }

  const motDePasseValide = await verifierMotDePasse(mot_de_passe, employe.mot_de_passe_hash);
  if (!motDePasseValide) {
    return res.status(401).json({ erreur: 'Identifiants incorrects.' });
  }

  const token = genererToken(employe);
  res.json({ token, employe: sansMotDePasse(employe) });
});

// GET /api/auth/me - vérifie le token et retourne l'identité courante
router.get('/me', require('../middleware/authMiddleware'), async (req, res) => {
  const employe = await Employe.findOne({
    id: req.utilisateur.id,
    clinic_id: req.utilisateur.clinic_id,
    actif: { $ne: false }
  });

  if (!employe) {
    return res.status(401).json({ erreur: 'Compte introuvable ou désactivé.' });
  }

  res.json({ utilisateur: sansMotDePasse(employe) });
});

module.exports = router;
