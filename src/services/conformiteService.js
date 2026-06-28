const { TEMPS_PLANNING } = require('../constants');
const { Besoin, Creneau } = require('../models');
const { creneauConcernePatient } = require('../utils/creneauUtils');

function calculerScoreConformite(besoins, creneaux) {
  const dureeSeanceMin = TEMPS_PLANNING.DUREE_SEANCE_MIN;
  const besoinsActifs = (besoins || []).filter(b => b.actif !== false);
  const creneauxActifs = (creneaux || []).filter(c => c.statut !== 'ANNULE');

  const seancesPrevues = besoinsActifs.reduce(
    (total, besoin) => total + (Number(besoin.seances_par_semaine) || 0),
    0
  );
  const seancesPlanifiees = creneauxActifs.length;

  const heuresForfait = (seancesPrevues * dureeSeanceMin) / 60;
  const heuresPlanifiees = (seancesPlanifiees * dureeSeanceMin) / 60;

  let score = 0;
  if (heuresForfait > 0) {
    score = Math.round((heuresPlanifiees / heuresForfait) * 100);
  } else if (seancesPlanifiees > 0) {
    score = 100;
  }

  return {
    score: Math.min(score, 100),
    conforme: heuresForfait > 0 && score >= 100,
    heuresPlanifiees,
    heuresForfait,
    seancesPlanifiees,
    seancesPrevues,
    forfaitDefini: heuresForfait > 0
  };
}

async function calculerScoreConformitePatient(clinicId, patientId, filtreCreneaux = {}) {
  const [besoins, creneauxIndividuels, creneauxAteliers] = await Promise.all([
    Besoin.find({ clinic_id: clinicId, patient_id: patientId }).lean(),
    Creneau.find({ clinic_id: clinicId, patient_id: patientId, ...filtreCreneaux }).lean(),
    Creneau.find({ clinic_id: clinicId, type: 'ATELIER', patient_ids: patientId, ...filtreCreneaux }).lean()
  ]);
  const creneaux = [...creneauxIndividuels, ...creneauxAteliers];
  return calculerScoreConformite(besoins, creneaux);
}

async function calculerConformiteGlobaleClinique(clinicId, filtreCreneaux = {}, semainesDansPeriode = 1) {
  const { Patient } = require('../models');
  const [patients, besoins, creneaux] = await Promise.all([
    Patient.find({ clinic_id: clinicId }).lean(),
    Besoin.find({ clinic_id: clinicId }).lean(),
    Creneau.find({ clinic_id: clinicId, ...filtreCreneaux }).lean()
  ]);
  return calculerConformiteGlobale(patients, besoins, creneaux, semainesDansPeriode);
}

function calculerConformiteGlobale(patients, besoins, creneaux, semainesDansPeriode = 1) {
  const patientsActifs = patients.filter(p => p.statut === 'ACTIF');
  const scores = [];
  let heuresPlanifieesTotal = 0;
  let heuresForfaitTotal = 0;

  patientsActifs.forEach(patient => {
    const besoinsPatient = besoins.filter(b => b.patient_id === patient.id);
    const creneauxPatient = creneaux.filter(c => creneauConcernePatient(c, patient.id));
    const conformite = calculerScoreConformite(besoinsPatient, creneauxPatient);

    if (!conformite.forfaitDefini) return;

    const heuresForfaitPeriode = conformite.heuresForfait * semainesDansPeriode;
    const scorePeriode = heuresForfaitPeriode > 0
      ? Math.min(100, Math.round((conformite.heuresPlanifiees / heuresForfaitPeriode) * 100))
      : 0;

    scores.push({
      patient_id: patient.id,
      nom: `${patient.prenom} ${patient.nom}`,
      score: scorePeriode,
      conforme: scorePeriode >= 100,
      heuresPlanifiees: conformite.heuresPlanifiees,
      heuresForfait: heuresForfaitPeriode
    });

    heuresPlanifieesTotal += conformite.heuresPlanifiees;
    heuresForfaitTotal += heuresForfaitPeriode;
  });

  const scoreMoyen = scores.length
    ? Math.round(scores.reduce((s, p) => s + p.score, 0) / scores.length)
    : 0;

  return {
    scoreMoyen,
    patientsEvalues: scores.length,
    patientsConformes: scores.filter(p => p.conforme).length,
    heuresPlanifiees: Math.round(heuresPlanifieesTotal * 10) / 10,
    heuresForfait: Math.round(heuresForfaitTotal * 10) / 10,
    patients: scores.sort((a, b) => a.score - b.score)
  };
}

module.exports = {
  calculerScoreConformite,
  calculerScoreConformitePatient,
  calculerConformiteGlobale,
  calculerConformiteGlobaleClinique
};
