const { TEMPS_PLANNING } = require('../constants');

function minutesDepuisMinuit(heure) {
  const [h, m] = heure.split(':').map(Number);
  return h * 60 + m;
}

function formaterHeure(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function horaireAlignePas(heure, pas = TEMPS_PLANNING.PAS_MINUTES) {
  return minutesDepuisMinuit(heure) % pas === 0;
}

function dureePlageMinutes(heureDebut, heureFin) {
  return minutesDepuisMinuit(heureFin) - minutesDepuisMinuit(heureDebut);
}

function plageHoraireValide(heureDebut, heureFin) {
  const duree = dureePlageMinutes(heureDebut, heureFin);
  if (duree <= 0) return 'L\'heure de fin doit être après l\'heure de début.';
  if (!horaireAlignePas(heureDebut) || !horaireAlignePas(heureFin)) {
    return 'Les horaires doivent être espacés par tranches de 5 minutes.';
  }
  if (duree % TEMPS_PLANNING.DUREE_BLOC_MIN !== 0) {
    return `La plage ${heureDebut}-${heureFin} doit durer un multiple de ${TEMPS_PLANNING.DUREE_BLOC_MIN} minutes.`;
  }
  return null;
}

function seChevauchent(debut1, fin1, debut2, fin2) {
  const d1 = minutesDepuisMinuit(debut1);
  const f1 = minutesDepuisMinuit(fin1);
  const d2 = minutesDepuisMinuit(debut2);
  const f2 = minutesDepuisMinuit(fin2);
  return d1 < f2 && d2 < f1;
}

function formaterDateLocale(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const jour = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${jour}`;
}

function parseDateLocale(dateStr) {
  const [y, m, jour] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, jour);
}

function lundiDeLaSemaine(dateStr) {
  const d = parseDateLocale(dateStr);
  const jour = d.getDay();
  const diff = jour === 0 ? -6 : 1 - jour;
  d.setDate(d.getDate() + diff);
  return formaterDateLocale(d);
}

function lesCinqJoursDeLaSemaine(lundiStr) {
  const dates = [];
  const base = parseDateLocale(lundiStr);
  for (let i = 0; i < 5; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    dates.push({
      date: formaterDateLocale(d),
      jour_semaine: i + 1
    });
  }
  return dates;
}

function genererCreneauxSeances(heureDebut, heureFin) {
  const { DUREE_SEANCE_MIN, PAUSE_ENTRE_SEANCES_MIN } = TEMPS_PLANNING;
  const creneaux = [];
  let debut = minutesDepuisMinuit(heureDebut);
  const fin = minutesDepuisMinuit(heureFin);
  const pas = DUREE_SEANCE_MIN + PAUSE_ENTRE_SEANCES_MIN;

  while (debut + DUREE_SEANCE_MIN <= fin) {
    const finMin = debut + DUREE_SEANCE_MIN;
    creneaux.push({
      heure_debut: formaterHeure(debut),
      heure_fin: formaterHeure(finMin)
    });
    debut += pas;
  }
  return creneaux;
}

function genererHeuresAgenda() {
  const heures = [];
  const plages = [
    ['08:00', '11:20'],
    ['13:30', '16:50']
  ];
  for (const [debut, fin] of plages) {
    genererCreneauxSeances(debut, fin).forEach(c => {
      if (!heures.includes(c.heure_debut)) heures.push(c.heure_debut);
    });
  }
  return heures;
}

module.exports = {
  minutesDepuisMinuit,
  formaterHeure,
  horaireAlignePas,
  dureePlageMinutes,
  plageHoraireValide,
  seChevauchent,
  formaterDateLocale,
  parseDateLocale,
  lundiDeLaSemaine,
  lesCinqJoursDeLaSemaine,
  genererCreneauxSeances,
  genererHeuresAgenda
};
