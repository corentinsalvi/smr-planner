require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { connectDB } = require('../config/database');
const {
  Clinic,
  Employe,
  Disponibilite,
  Patient,
  Besoin,
  Creneau,
  Absence,
  CalendarSyncToken
} = require('../models');
const { DEFAULT_CLINIC_SLUG } = require('../utils/clinicScope');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function lireJson(nom) {
  const fichier = path.join(DATA_DIR, `${nom}.json`);
  if (!fs.existsSync(fichier)) return [];
  return JSON.parse(fs.readFileSync(fichier, 'utf8'));
}

function avecClinicId(documents, clinicId) {
  return documents.map(doc => ({ ...doc, clinic_id: clinicId }));
}

async function migrer() {
  await connectDB();

  const employes = lireJson('employes');
  const disponibilites = lireJson('disponibilites');
  const patients = lireJson('patients');
  const besoins = lireJson('besoins');
  const creneaux = lireJson('creneaux');
  const absences = lireJson('absences');
  const jetons = lireJson('calendar_sync_tokens');

  if (!employes.length && !patients.length) {
    console.log('Aucune donnée JSON trouvée dans ./data/. Lancez npm run seed à la place.');
    process.exit(0);
  }

  let clinic = await Clinic.findOne({ slug: DEFAULT_CLINIC_SLUG });
  if (!clinic) {
    clinic = await Clinic.create({
      id: uuidv4(),
      nom: 'Clinique SMR',
      slug: DEFAULT_CLINIC_SLUG,
      timezone: 'Europe/Paris',
      actif: true
    });
    console.log(`Clinique créée : ${clinic.nom}`);
  }

  const clinicId = clinic.id;

  await Promise.all([
    Employe.deleteMany({ clinic_id: clinicId }),
    Disponibilite.deleteMany({ clinic_id: clinicId }),
    Patient.deleteMany({ clinic_id: clinicId }),
    Besoin.deleteMany({ clinic_id: clinicId }),
    Creneau.deleteMany({ clinic_id: clinicId }),
    Absence.deleteMany({ clinic_id: clinicId }),
    CalendarSyncToken.deleteMany({ clinic_id: clinicId })
  ]);

  if (employes.length) await Employe.insertMany(avecClinicId(employes, clinicId));
  if (disponibilites.length) await Disponibilite.insertMany(avecClinicId(disponibilites, clinicId));
  if (patients.length) await Patient.insertMany(avecClinicId(patients, clinicId));
  if (besoins.length) await Besoin.insertMany(avecClinicId(besoins, clinicId));
  if (creneaux.length) await Creneau.insertMany(avecClinicId(creneaux, clinicId));
  if (absences.length) await Absence.insertMany(avecClinicId(absences, clinicId));
  if (jetons.length) await CalendarSyncToken.insertMany(avecClinicId(jetons, clinicId));

  console.log('✅ Migration JSON → MongoDB terminée.');
  console.log(`   ${employes.length} employés`);
  console.log(`   ${patients.length} patients`);
  console.log(`   ${creneaux.length} créneaux`);
  console.log(`   ${absences.length} absences`);

  process.exit(0);
}

migrer().catch(err => {
  console.error('Erreur de migration:', err);
  process.exit(1);
});
