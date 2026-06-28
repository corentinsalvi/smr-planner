require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const path = require('path');
const { connectDB } = require('./config/database');
const { initDefaultClinic } = require('./utils/clinicScope');

const authMiddleware = require('./middleware/authMiddleware');
const bloquerAccesInterne = require('./middleware/bloquerAccesInterne');
const { sanitizeInput } = require('./middleware/sanitizeInput');
const { limiteurGlobal } = require('./middleware/rateLimit');
const { verifierConfigurationSecurite } = require('./utils/securityConfig');
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

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

verifierConfigurationSecurite();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // Les couleurs par métier sont appliquées via style="" dans le frontend
      styleSrc: ["'self'", "'unsafe-inline'"],
      styleSrcAttr: ["'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginResourcePolicy: { policy: 'same-site' }
}));

app.use(bloquerAccesInterne);
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use(sanitizeInput);

app.get('/api/sante', (req, res) => {
  res.json({ statut: 'OK', heure: new Date().toISOString() });
});

app.use('/api', limiteurGlobal);

app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.use('/v1/calendar', calendarRoutes);
app.use('/api/auth', authRoutes);

app.use('/api/employes', authMiddleware, employeRoutes);
app.use('/api/patients', authMiddleware, patientRoutes);
app.use('/api/creneaux', authMiddleware, creneauRoutes);
app.use('/api/absences', authMiddleware, absenceRoutes);
app.use('/api/rapports', authMiddleware, rapportRoutes);
app.use('/api/calendar/sync', authMiddleware, creerRoutesGestion());

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
