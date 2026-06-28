const { v4: uuidv4 } = require('uuid');
const {
  Employe,
  Disponibilite,
  Absence,
  Patient,
  Besoin,
  Creneau
} = require('../models');
const {
  seChevauchent,
  lesCinqJoursDeLaSemaine,
  genererCreneauxSeances,
  minutesDepuisMinuit,
  memeJourSemaine
} = require('../utils/dateUtils');
const { REGLES_PLANNING } = require('../constants');
const { estProAbsent } = require('../utils/absenceUtils');
const { creneauConcernePatient } = require('../utils/creneauUtils');

const INTENSIFS = new Set(REGLES_PLANNING.ROLES_INTENSIFS);

function rdvPatientJour(creneaux, patientId, date) {
  return creneaux.filter(
    c => creneauConcernePatient(c, patientId) && c.date === date && c.statut !== 'ANNULE'
  );
}

function aDejaSpecialiteCeJour(creneaux, patientId, date, role) {
  return rdvPatientJour(creneaux, patientId, date).some(c => c.role === role);
}

function compteRdvJour(creneaux, patientId, date) {
  return rdvPatientJour(creneaux, patientId, date).length;
}

function estIntensif(role) {
  return INTENSIFS.has(role);
}

function jourAdjacentSpecialite(creneaux, patientId, role, date, jours) {
  const idx = jours.findIndex(j => j.date === date);
  if (idx < 0) return false;
  return creneaux.some(c => {
    if (!creneauConcernePatient(c, patientId) || c.role !== role || c.statut === 'ANNULE') return false;
    const i = jours.findIndex(j => j.date === c.date);
    return i >= 0 && Math.abs(i - idx) === 1;
  });
}

function distanceJours(dateA, dateB, jours) {
  const i = jours.findIndex(j => j.date === dateA);
  const j = jours.findIndex(j => j.date === dateB);
  if (i < 0 || j < 0) return 0;
  return Math.abs(i - j);
}

function distanceMinSpecialite(creneaux, patientId, role, date, jours) {
  const autres = creneaux.filter(
    c => creneauConcernePatient(c, patientId) && c.role === role && c.date !== date && c.statut !== 'ANNULE'
  );
  if (!autres.length) return jours.length;
  return Math.min(...autres.map(c => distanceJours(date, c.date, jours)));
}

function longueurChaineIntensive(creneaux, patientId, date, heureDebut, heureFin, roleAjoute = null) {
  const rdv = rdvPatientJour(creneaux, patientId, date)
    .filter(c => estIntensif(c.role))
    .map(c => ({
      debut: minutesDepuisMinuit(c.heure_debut),
      fin: minutesDepuisMinuit(c.heure_fin),
      role: c.role
    }));

  if (roleAjoute && estIntensif(roleAjoute)) {
    rdv.push({
      debut: minutesDepuisMinuit(heureDebut),
      fin: minutesDepuisMinuit(heureFin),
      role: roleAjoute
    });
  }

  if (!rdv.length) return 0;

  rdv.sort((a, b) => a.debut - b.debut);

  let maxChaine = 1;
  let chaine = 1;
  for (let i = 1; i < rdv.length; i++) {
    if (rdv[i].debut === rdv[i - 1].fin) chaine += 1;
    else chaine = 1;
    maxChaine = Math.max(maxChaine, chaine);
  }
  return maxChaine;
}

function respecteReposIntensif(creneaux, candidat, role) {
  if (!estIntensif(role)) return true;

  const chaine = longueurChaineIntensive(
    creneaux,
    candidat.patient_id,
    candidat.date,
    candidat.heure_debut,
    candidat.heure_fin,
    role
  );
  return chaine <= REGLES_PLANNING.MAX_ENCHAINEMENT_INTENSIF;
}

function validerReglesPatient(creneaux, candidat, role) {
  const { patient_id: patientId, date } = candidat;

  if (aDejaSpecialiteCeJour(creneaux, patientId, date, role)) {
    return 'Séance unique : ce métier est déjà planifié ce jour pour ce patient.';
  }

  if (compteRdvJour(creneaux, patientId, date) >= REGLES_PLANNING.PLAFOND_SEANCES_JOUR) {
    return `Plafond journalier : maximum ${REGLES_PLANNING.PLAFOND_SEANCES_JOUR} séances par jour.`;
  }

  if (!respecteReposIntensif(creneaux, candidat, role)) {
    return 'Repos : éviter deux séances physiques intensives consécutives sans pause.';
  }

  return null;
}

function ordonnerJours(jours, besoin, creneaux) {
  return [...jours].sort((a, b) => {
    const score = jour => {
      let s = 0;
      if (aDejaSpecialiteCeJour(creneaux, besoin.patient.id, jour.date, besoin.role)) s += 1000;
      if (compteRdvJour(creneaux, besoin.patient.id, jour.date) >= REGLES_PLANNING.PLAFOND_SEANCES_JOUR) s += 500;
      if (jourAdjacentSpecialite(creneaux, besoin.patient.id, besoin.role, jour.date, jours)) s += 300;
      s += compteRdvJour(creneaux, besoin.patient.id, jour.date) * 10;
      s -= distanceMinSpecialite(creneaux, besoin.patient.id, besoin.role, jour.date, jours) * 15;
      return s;
    };
    return score(a) - score(b);
  });
}

async function genererPlanningHebdomadaire(lundi, options = {}) {
  const clinicId = options.clinicId;
  if (!clinicId) {
    return { planningGenere: [], conflits: [], erreur: 'Clinique non identifiée.' };
  }

  const [employes, disponibilites, absences, patients, besoins, creneauxBruts] = await Promise.all([
    Employe.find({ clinic_id: clinicId, actif: { $ne: false } }).lean(),
    Disponibilite.find({ clinic_id: clinicId }).lean(),
    Absence.find({ clinic_id: clinicId }).lean(),
    Patient.find({ clinic_id: clinicId, statut: 'ACTIF' }).lean(),
    Besoin.find({ clinic_id: clinicId, actif: { $ne: false } }).lean(),
    Creneau.find({ clinic_id: clinicId, statut: { $ne: 'ANNULE' } }).lean()
  ]);

  const jours = lesCinqJoursDeLaSemaine(lundi);
  const datesSemaine = new Set(jours.map(j => j.date));

  const employeCible = options.employeId
    ? employes.find(e => e.id === options.employeId)
    : null;

  if (options.employeId && !employeCible) {
    return { planningGenere: [], conflits: [], erreur: 'Professionnel introuvable ou inactif.' };
  }

  let creneauxExistants = creneauxBruts;
  if (options.remplacerSemaine && options.employeId) {
    creneauxExistants = creneauxExistants.filter(c =>
      !(datesSemaine.has(c.date) && c.employe_id === options.employeId)
    );
  } else if (options.remplacerSemaine) {
    creneauxExistants = creneauxExistants.filter(c => !datesSemaine.has(c.date));
  }

  const planningGenere = [];
  const conflits = [];

  const besoinsAPlacer = [];
  for (const patient of patients) {
    const besoinsPatient = besoins.filter(b => b.patient_id === patient.id);
    for (const besoin of besoinsPatient) {
      if (employeCible) {
        if (besoin.role !== employeCible.role) continue;
        if (besoin.professionnel_prefere_id && besoin.professionnel_prefere_id !== employeCible.id) {
          continue;
        }
      }

      const dejaPlacees = creneauxExistants.filter(c =>
        creneauConcernePatient(c, patient.id) &&
        c.role === besoin.role &&
        datesSemaine.has(c.date)
      ).length;
      const restantes = Math.max(0, besoin.seances_par_semaine - dejaPlacees);

      for (let i = 0; i < restantes; i++) {
        besoinsAPlacer.push({ ...besoin, patient, tentative: i, seancesRestantes: restantes });
      }
    }
  }
  besoinsAPlacer.sort((a, b) => a.priorite - b.priorite);

  const tousLesCreneaux = [...creneauxExistants];

  function prosPourRole(role, prefId) {
    if (employeCible) return [employeCible];

    let pros = employes.filter(e => e.role === role);
    if (prefId) {
      const pref = pros.find(e => e.id === prefId);
      if (pref) return [pref, ...pros.filter(e => e.id !== prefId)];
    }
    return pros;
  }

  for (const besoin of besoinsAPlacer) {
    let place = false;
    let derniereRaison = null;
    const pros = prosPourRole(besoin.role, besoin.professionnel_prefere_id);
    const joursOrdonnes = ordonnerJours(jours, besoin, tousLesCreneaux);

    for (const jour of joursOrdonnes) {
      if (place) break;
      for (const pro of pros) {
        if (place) break;
        const dispos = disponibilites.filter(
          d => d.employe_id === pro.id && memeJourSemaine(d.jour_semaine, jour.jour_semaine)
        );
        for (const dispo of dispos) {
          const slots = genererCreneauxSeances(dispo.heure_debut, dispo.heure_fin);
          for (const slot of slots) {
            const candidat = {
              patient_id: besoin.patient.id,
              employe_id: pro.id,
              date: jour.date,
              heure_debut: slot.heure_debut,
              heure_fin: slot.heure_fin
            };

            const conflitPro = tousLesCreneaux.some(c =>
              c.employe_id === candidat.employe_id &&
              c.date === candidat.date &&
              c.statut !== 'ANNULE' &&
              seChevauchent(c.heure_debut, c.heure_fin, candidat.heure_debut, candidat.heure_fin)
            );
            const conflitPatient = tousLesCreneaux.some(c =>
              creneauConcernePatient(c, candidat.patient_id) &&
              c.date === candidat.date &&
              c.statut !== 'ANNULE' &&
              seChevauchent(c.heure_debut, c.heure_fin, candidat.heure_debut, candidat.heure_fin)
            );

            const reglePatient = validerReglesPatient(
              tousLesCreneaux,
              candidat,
              besoin.role
            );

            if (conflitPro || conflitPatient) continue;

            if (estProAbsent(absences, pro.id, candidat.date, candidat.heure_debut, candidat.heure_fin)) {
              continue;
            }

            if (reglePatient) {
              derniereRaison = reglePatient;
              continue;
            }

            const creneau = {
              id: uuidv4(),
              patient_id: candidat.patient_id,
              employe_id: candidat.employe_id,
              besoin_soin_id: besoin.id,
              role: besoin.role,
              date: candidat.date,
              heure_debut: candidat.heure_debut,
              heure_fin: candidat.heure_fin,
              statut: 'PLANIFIE',
              genere_auto: true
            };
            planningGenere.push(creneau);
            tousLesCreneaux.push(creneau);
            place = true;
            break;
          }
          if (place) break;
        }
      }
    }

    if (!place) {
      const total = besoin.seancesRestantes ?? besoin.seances_par_semaine;
      conflits.push({
        patient: `${besoin.patient.prenom} ${besoin.patient.nom}`,
        role: besoin.role,
        message: derniereRaison
          ? `${derniereRaison} (${besoin.tentative + 1}/${total})`
          : `Impossible de placer une séance (${besoin.tentative + 1}/${total})`
      });
    }
  }

  return { planningGenere, conflits, employe: employeCible };
}

module.exports = { genererPlanningHebdomadaire };
