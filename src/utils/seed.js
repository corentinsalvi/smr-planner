// Lance ce script avec `npm run seed` pour peupler les fichiers JSON avec
// des données de démonstration : un employé par métier + quelques patients.
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { writeAllSync } = require('./jsonStore');
const { ROLES } = require('../constants');

async function seed() {
  const motDePasseHashDemo = await bcrypt.hash('demo1234', 10);

  const employesData = [
    { prenom: 'Sophie', nom: 'Renard', role: 'MEDECIN_SMR' },
    { prenom: 'Claire', nom: 'Dupont', role: 'KINESITHERAPEUTE' },
    { prenom: 'Marc', nom: 'Lefevre', role: 'KINESITHERAPEUTE' },
    { prenom: 'Julie', nom: 'Moreau', role: 'ERGOTHERAPEUTE' },
    { prenom: 'Nadia', nom: 'Belkacem', role: 'ORTHOPHONISTE' },
    { prenom: 'Thomas', nom: 'Girard', role: 'NEUROPSYCHOLOGUE' },
    { prenom: 'Elise', nom: 'Picard', role: 'DIETETICIEN' },
    { prenom: 'Sandra', nom: 'Roussel', role: 'ASSISTANTE_SOCIALE' },
    { prenom: 'Valerie', nom: 'Fontaine', role: 'IDE_COORDINATRICE' },
    { prenom: 'Karim', nom: 'Haddad', role: 'AIDE_SOIGNANT' }
  ];

  const employes = employesData.map(e => ({
    id: uuidv4(),
    nom: e.nom,
    prenom: e.prenom,
    email: `${e.prenom.toLowerCase()}.${e.nom.toLowerCase()}@clinique-smr.fr`,
    mot_de_passe_hash: motDePasseHashDemo,
    role: e.role,
    actif: true,
    created_at: new Date().toISOString()
  }));

  // Disponibilités standard : Lundi-Vendredi 8h-12h et 13h30-17h30 (multiples de 50 min)
  const disponibilites = [];
  for (const employe of employes) {
    for (let jour = 1; jour <= 5; jour++) {
      disponibilites.push({ id: uuidv4(), employe_id: employe.id, jour_semaine: jour, heure_debut: '08:00', heure_fin: '11:20' });
      disponibilites.push({ id: uuidv4(), employe_id: employe.id, jour_semaine: jour, heure_debut: '13:30', heure_fin: '16:50' });
    }
  }

  const patientsData = [
    { nom: 'Martin', prenom: 'Henri', besoins: [
      { role: 'KINESITHERAPEUTE', seances_par_semaine: 4, priorite: 2 },
      { role: 'ERGOTHERAPEUTE', seances_par_semaine: 2, priorite: 4 },
      { role: 'DIETETICIEN', seances_par_semaine: 1, priorite: 7 },
      { role: 'MEDECIN_SMR', seances_par_semaine: 1, priorite: 1 },
      { role: 'AIDE_SOIGNANT', seances_par_semaine: 2, priorite: 6 }
    ]},
    { nom: 'Lambert', prenom: 'Yvonne', besoins: [
      { role: 'KINESITHERAPEUTE', seances_par_semaine: 3, priorite: 3 },
      { role: 'ORTHOPHONISTE', seances_par_semaine: 2, priorite: 3 },
      { role: 'NEUROPSYCHOLOGUE', seances_par_semaine: 1, priorite: 5 },
      { role: 'IDE_COORDINATRICE', seances_par_semaine: 1, priorite: 2 },
      { role: 'MEDECIN_SMR', seances_par_semaine: 1, priorite: 1 }
    ]},
    { nom: 'Petit', prenom: 'Robert', besoins: [
      { role: 'KINESITHERAPEUTE', seances_par_semaine: 2, priorite: 5 },
      { role: 'ASSISTANTE_SOCIALE', seances_par_semaine: 1, priorite: 6 },
      { role: 'AIDE_SOIGNANT', seances_par_semaine: 2, priorite: 7 },
      { role: 'IDE_COORDINATRICE', seances_par_semaine: 1, priorite: 4 }
    ]}
  ];

  const patients = [];
  const besoins = [];
  for (const p of patientsData) {
    const patient = {
      id: uuidv4(),
      nom: p.nom,
      prenom: p.prenom,
      date_naissance: null,
      statut: 'ACTIF',
      date_entree: new Date().toISOString().slice(0, 10),
      date_sortie_prevue: null,
      created_at: new Date().toISOString()
    };
    patients.push(patient);
    for (const b of p.besoins) {
      besoins.push({
        id: uuidv4(),
        patient_id: patient.id,
        role: b.role,
        seances_par_semaine: b.seances_par_semaine,
        priorite: b.priorite,
        professionnel_prefere_id: null,
        actif: true
      });
    }
  }

  writeAllSync('employes', employes);
  writeAllSync('disponibilites', disponibilites);
  writeAllSync('patients', patients);
  writeAllSync('besoins', besoins);
  writeAllSync('creneaux', []);

  console.log('✅ Données de démonstration créées.');
  console.log(`   ${employes.length} employés (mot de passe pour tous : demo1234)`);
  console.log(`   ${patients.length} patients`);
  console.log('\n📧 Comptes de connexion :');
  employes.forEach(e => console.log(`   ${e.email}  [${ROLES[e.role].label}]`));
}

seed().catch(err => {
  console.error('Erreur lors du seed:', err);
  process.exit(1);
});
