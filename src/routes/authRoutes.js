const express = require('express');
const router = express.Router();
const { readAll } = require('../utils/jsonStore');
const { verifierMotDePasse, genererToken } = require('../services/authService');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, mot_de_passe } = req.body;

  if (!email || !mot_de_passe) {
    return res.status(400).json({ erreur: 'Email et mot de passe sont requis.' });
  }

  const employes = readAll('employes');
  const employe = employes.find(e => e.email.toLowerCase() === email.toLowerCase());

  if (!employe || employe.actif === false) {
    return res.status(401).json({ erreur: 'Identifiants incorrects.' });
  }

  const motDePasseValide = await verifierMotDePasse(mot_de_passe, employe.mot_de_passe_hash);
  if (!motDePasseValide) {
    return res.status(401).json({ erreur: 'Identifiants incorrects.' });
  }

  const token = genererToken(employe);
  const { mot_de_passe_hash, ...employeSansHash } = employe;

  res.json({ token, employe: employeSansHash });
});

// GET /api/auth/me - vérifie le token et retourne l'identité courante
router.get('/me', require('../middleware/authMiddleware'), (req, res) => {
  const employes = readAll('employes');
  const employe = employes.find(e => e.id === req.utilisateur.id);

  if (!employe || employe.actif === false) {
    return res.status(401).json({ erreur: 'Compte introuvable ou désactivé.' });
  }

  const { mot_de_passe_hash, ...employeSansHash } = employe;
  res.json({ utilisateur: employeSansHash });
});

module.exports = router;
