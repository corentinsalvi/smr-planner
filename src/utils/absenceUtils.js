const { seChevauchent } = require('./dateUtils');

const TYPES_ABSENCE = ['CONGE', 'ARRET_MALADIE', 'FORMATION'];

function dateDansPlage(date, debut, fin) {
  return date >= debut && date <= fin;
}

function absenceCouvreCreneau(absence, date, heureDebut, heureFin) {
  if (!dateDansPlage(date, absence.date_debut, absence.date_fin)) return false;
  if (absence.journee_entiere !== false) return true;
  if (!absence.heure_debut || !absence.heure_fin) return true;
  return seChevauchent(absence.heure_debut, absence.heure_fin, heureDebut, heureFin);
}

function estProAbsent(absences, employeId, date, heureDebut, heureFin) {
  return absences.some(a =>
    a.employe_id === employeId &&
    absenceCouvreCreneau(a, date, heureDebut, heureFin)
  );
}

function absencePourCreneau(absences, employeId, date, heureDebut, heureFin) {
  return absences.find(a =>
    a.employe_id === employeId &&
    absenceCouvreCreneau(a, date, heureDebut, heureFin)
  ) || null;
}

module.exports = {
  TYPES_ABSENCE,
  dateDansPlage,
  absenceCouvreCreneau,
  estProAbsent,
  absencePourCreneau
};
