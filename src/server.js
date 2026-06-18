require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const authMiddleware = require('./middleware/authMiddleware');
const authRoutes = require('./routes/authRoutes');
const employeRoutes = require('./routes/employeRoutes');
const patientRoutes = require('./routes/patientRoutes');
const creneauRoutes = require('./routes/creneauRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const { creerRoutesGestion } = require('./routes/calendarRoutes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Sert la page frontend unique (index.html) directement depuis le backend,
// pour que tout tourne avec une seule commande sans configurer de second serveur.
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Flux iCal public (abonnement lecture seule, sans JWT)
app.use('/v1/calendar', calendarRoutes);

// Routes publiques
app.use('/api/auth', authRoutes);

// Routes protégées par JWT
app.use('/api/employes', authMiddleware, employeRoutes);
app.use('/api/patients', authMiddleware, patientRoutes);
app.use('/api/creneaux', authMiddleware, creneauRoutes);
app.use('/api/calendar/sync', authMiddleware, creerRoutesGestion());

app.get('/api/sante', (req, res) => {
  res.json({ statut: 'OK', heure: new Date().toISOString() });
});

// Gestion des erreurs non interceptées
app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({ erreur: 'Erreur interne du serveur.' });
});

app.listen(PORT, () => {
  console.log(`Serveur SMR Planning démarré sur http://localhost:${PORT}`);
  console.log(`Données persistées dans ./data/*.json`);
});
