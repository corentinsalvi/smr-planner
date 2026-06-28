const { ROLES } = require('../constants');
const { creneauConcernePatient, estAtelier } = require('../utils/creneauUtils');

function echapperTexteIcs(texte) {
  return String(texte || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function formaterDateHeureIcs(date, heure) {
  const [y, m, jour] = date.split('-');
  const [h, min] = heure.split(':');
  return `${y}${m}${jour}T${h}${min}00`;
}

function labelRole(role) {
  return ROLES[role]?.label || role || 'Séance';
}

function formaterDtStamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/**
 * Flux d'abonnement iCal (RFC 5545) — données minimales (RGPD).
 * SUMMARY : "08:50 - Consultation Nom Prénom (Métier)"
 * Pas de DESCRIPTION, LOCATION ni donnée médicale.
 */
function genererFluxIcsAbonnement({ creneaux, patients, nomCalendrier = 'SMR Planning' }) {
  const patientsParId = new Map(patients.map(p => [p.id, p]));
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SMR Planning//Abonnement//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    `X-WR-CALNAME:${echapperTexteIcs(nomCalendrier)}`
  ];

  const creneauxTries = [...creneaux].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.heure_debut.localeCompare(b.heure_debut);
  });

  for (const creneau of creneauxTries) {
    const metier = labelRole(creneau.role);
    const dtStart = formaterDateHeureIcs(creneau.date, creneau.heure_debut);
    const dtEnd = formaterDateHeureIcs(creneau.date, creneau.heure_fin);

    let summary;
    if (estAtelier(creneau)) {
      const n = (creneau.patient_ids || []).length;
      const libelle = creneau.notes?.trim() || 'Atelier de groupe';
      summary = `${creneau.heure_debut} - ${libelle} (${n} patients, ${metier})`;
    } else {
      const patient = patientsParId.get(creneau.patient_id);
      const nomPatient = patient ? `${patient.prenom} ${patient.nom}` : 'Patient';
      summary = `${creneau.heure_debut} - Consultation ${nomPatient} (${metier})`;
    }

    lignes.push(
      'BEGIN:VEVENT',
      `UID:${creneau.id}@smr-planning`,
      `DTSTAMP:${formaterDtStamp()}`,
      `DTSTART:${dtStart}`,
      `DTEND:${dtEnd}`,
      `SUMMARY:${echapperTexteIcs(summary)}`,
      'END:VEVENT'
    );
  }

  lignes.push('END:VCALENDAR');
  return `${lignes.join('\r\n')}\r\n`;
}

/** Export ponctuel (.ics téléchargé depuis l'app) */
function genererFichierIcs({ creneaux, patients, employe, nomCalendrier = 'SMR Planning' }) {
  return genererFluxIcsAbonnement({
    creneaux,
    patients,
    nomCalendrier: nomCalendrier || `SMR — ${employe?.prenom} ${employe?.nom}`
  });
}

module.exports = { genererFichierIcs, genererFluxIcsAbonnement };
