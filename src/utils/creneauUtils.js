function estAtelier(creneau) {
  return creneau?.type === 'ATELIER';
}

function patientsIdsCreneau(creneau) {
  if (estAtelier(creneau)) return creneau.patient_ids || [];
  return creneau?.patient_id ? [creneau.patient_id] : [];
}

function creneauConcernePatient(creneau, patientId) {
  return patientsIdsCreneau(creneau).includes(patientId);
}

module.exports = {
  estAtelier,
  patientsIdsCreneau,
  creneauConcernePatient
};
