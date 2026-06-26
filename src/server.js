require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDB } = require('./config/database');
const { initDefaultClinic } = require('./utils/clinicScope');

const authMiddleware = require('./middleware/authMiddleware');
const authRoutes = require('./routes/authRoutes');
const employeRoutes = require('./routes/employeRoutes');
const patientRoutes = require('./routes/patientRoutes');
const creneauRoutes = require('./routes/creneauRoutes');
const absenceRoutes = require('./routes/absenceRoutes');
const rapportRoutes = require('./routes/rapportRoutes');
const calendarRoutes = require('./routes/calendarRoutes');
const { creerRoutesGestion } = require('./routes/calendarRoutes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/v1/calendar', calendarRoutes);
app.use('/api/auth', authRoutes);

app.use('/api/employes', authMiddleware, employeRoutes);
app.use('/api/patients', authMiddleware, patientRoutes);
app.use('/api/creneaux', authMiddleware, creneauRoutes);
app.use('/api/absences', authMiddleware, absenceRoutes);
app.use('/api/rapports', authMiddleware, rapportRoutes);
app.use('/api/calendar/sync', authMiddleware, creerRoutesGestion());

app.get('/api/sante', (req, res) => {
  res.json({ statut: 'OK', heure: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Erreur non gérée:', err);
  res.status(500).json({ erreur: 'Erreur interne du serveur.' });
});

async function demarrer() {
  await connectDB();
  await initDefaultClinic();
  app.listen(PORT, () => {
    console.log(`Serveur SMR Planning démarré sur http://localhost:${PORT}`);
    console.log('Données persistées dans MongoDB.');
  });
}

demarrer().catch(err => {
  console.error('Impossible de démarrer le serveur:', err.message);
  process.exit(1);
});
