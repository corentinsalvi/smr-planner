const PDFDocument = require('pdfkit');
const {
  Patient,
  Besoin,
  Creneau,
  Employe,
  Absence,
  Disponibilite
} = require('../models');
const {
  formaterDateLocale,
  parseDateLocale,
  lundiDeLaSemaine,
  dureePlageMinutes
} = require('../utils/dateUtils');
const { absenceCouvreCreneau } = require('../utils/absenceUtils');
const { ROLES, TYPES_ABSENCE, TEMPS_PLANNING, DIRECTEUR_ROLES } = require('../constants');
const { calculerConformiteGlobale } = require('./conformiteService');

function premierJourMois(moisStr) {
  const [y, m] = moisStr.split('-').map(Number);
  return formaterDateLocale(new Date(y, m - 1, 1));
}

function dernierJourMois(moisStr) {
  const [y, m] = moisStr.split('-').map(Number);
  return formaterDateLocale(new Date(y, m, 0));
}

function libelleMois(moisStr) {
  const [y, m] = moisStr.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function compterSemainesOuvrees(debut, fin) {
  const jours = joursOuvresEntre(debut, fin);
  return Math.max(1, Math.ceil(jours.length / 5));
}

function joursOuvresEntre(debut, fin) {
  const jours = [];
  const d = parseDateLocale(debut);
  const finD = parseDateLocale(fin);
  while (d <= finD) {
    const jour = d.getDay();
    if (jour >= 1 && jour <= 5) jours.push(formaterDateLocale(new Date(d)));
    d.setDate(d.getDate() + 1);
  }
  return jours;
}

function decalageJours(dateStr, nb) {
  const d = parseDateLocale(dateStr);
  d.setDate(d.getDate() + nb);
  return formaterDateLocale(d);
}

function employesCliniques(employes) {
  return employes.filter(e => e.actif !== false && !DIRECTEUR_ROLES.includes(e.role));
}

function capaciteHeuresEmploye(disponibilites, employeId, joursOuvres) {
  const dispos = disponibilites.filter(d => d.employe_id === employeId);
  let minutes = 0;
  joursOuvres.forEach(date => {
    const jourSemaine = parseDateLocale(date).getDay() || 7;
    dispos.filter(d => d.jour_semaine === jourSemaine).forEach(d => {
      minutes += dureePlageMinutes(d.heure_debut, d.heure_fin);
    });
  });
  return minutes / 60;
}

function statutRhEmploye(employe, absences, joursSemaine) {
  const absencesEmploye = absences.filter(a => a.employe_id === employe.id);
  let joursAbsents = 0;
  const types = new Set();

  joursSemaine.forEach(date => {
    const couvert = absencesEmploye.some(a => {
      if (!absenceCouvreCreneau(a, date, '08:00', '17:30')) return false;
      types.add(a.type);
      return true;
    });
    if (couvert) joursAbsents += 1;
  });

  if (joursAbsents === 0) {
    return { statut: 'PRESENT', label: 'Présent', detail: 'Disponible toute la semaine', types: [] };
  }
  if (joursAbsents >= joursSemaine.length) {
    const type = [...types][0];
    const labelType = TYPES_ABSENCE[type]?.label || type;
    return { statut: 'ABSENT', label: labelType || 'Absent', detail: 'Indisponible toute la semaine', types: [...types] };
  }

  const labels = [...types].map(t => TYPES_ABSENCE[t]?.label || t);
  return {
    statut: 'PARTIEL',
    label: labels.join(' / ') || 'Absence partielle',
    detail: `${joursAbsents} jour(s) d'absence sur ${joursSemaine.length}`,
    types: [...types]
  };
}

function calculerBilanRh(employes, absences, dateDebut, dateFin) {
  const equipe = employesCliniques(employes);
  const joursSemaine = joursOuvresEntre(dateDebut, dateFin);
  const details = equipe.map(employe => {
    const rh = statutRhEmploye(employe, absences, joursSemaine);
    return {
      id: employe.id,
      prenom: employe.prenom,
      nom: employe.nom,
      role: employe.role,
      roleLabel: ROLES[employe.role]?.label || employe.role,
      ...rh
    };
  });

  const absents = details.filter(d => d.statut !== 'PRESENT');
  const enConge = details.filter(d => d.types.includes('CONGE'));
  const enArret = details.filter(d => d.types.includes('ARRET_MALADIE'));
  const enFormation = details.filter(d => d.types.includes('FORMATION'));
  const effectif = equipe.length;
  const presents = effectif - absents.length;
  const tauxPresence = effectif ? Math.round((presents / effectif) * 100) : 100;

  return {
    date_debut: dateDebut,
    date_fin: dateFin,
    effectif,
    presents,
    absents: absents.length,
    tauxPresence,
    equipeAuComplet: absents.length === 0,
    enConge: enConge.length,
    enArret: enArret.length,
    enFormation: enFormation.length,
    details
  };
}

function calculerOccupation(employes, disponibilites, absences, creneaux, joursOuvres) {
  const equipe = employesCliniques(employes);
  const creneauxActifs = creneaux.filter(c => c.statut !== 'ANNULE');
  const heuresSoins = (creneauxActifs.length * TEMPS_PLANNING.DUREE_SEANCE_MIN) / 60;

  let capaciteHeures = 0;
  equipe.forEach(employe => {
    let heures = capaciteHeuresEmploye(disponibilites, employe.id, joursOuvres);
    joursOuvres.forEach(date => {
      const absentJournee = absences.some(a =>
        a.employe_id === employe.id &&
        absenceCouvreCreneau(a, date, '08:00', '17:30') &&
        a.journee_entiere !== false
      );
      if (absentJournee) {
        const dispos = disponibilites.filter(d => d.employe_id === employe.id);
        const jourSemaine = parseDateLocale(date).getDay() || 7;
        dispos.filter(d => d.jour_semaine === jourSemaine).forEach(d => {
          heures -= dureePlageMinutes(d.heure_debut, d.heure_fin) / 60;
        });
      }
    });
    capaciteHeures += Math.max(0, heures);
  });

  const tauxOccupation = capaciteHeures > 0
    ? Math.min(100, Math.round((heuresSoins / capaciteHeures) * 100))
    : 0;

  return {
    tauxOccupation,
    heuresSoins: Math.round(heuresSoins * 10) / 10,
    seancesPlanifiees: creneauxActifs.length,
    capaciteHeures: Math.round(capaciteHeures * 10) / 10
  };
}

function moisCourant() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function getTableauDeBord(clinicId, moisStr = moisCourant()) {
  const [patients, besoins, creneaux, employes, absences, disponibilites] = await Promise.all([
    Patient.find({ clinic_id: clinicId }).lean(),
    Besoin.find({ clinic_id: clinicId }).lean(),
    Creneau.find({ clinic_id: clinicId }).lean(),
    Employe.find({ clinic_id: clinicId }).lean(),
    Absence.find({ clinic_id: clinicId }).lean(),
    Disponibilite.find({ clinic_id: clinicId }).lean()
  ]);

  const dateDebut = premierJourMois(moisStr);
  const dateFin = dernierJourMois(moisStr);
  const joursMois = joursOuvresEntre(dateDebut, dateFin);
  const semaines = compterSemainesOuvrees(dateDebut, dateFin);

  const creneauxMois = creneaux.filter(c =>
    c.date >= dateDebut && c.date <= dateFin
  );
  const absencesMois = absences.filter(a =>
    a.date_fin >= dateDebut && a.date_debut <= dateFin
  );

  const conformite = calculerConformiteGlobale(patients, besoins, creneauxMois, semaines);
  const occupation = calculerOccupation(employes, disponibilites, absencesMois, creneauxMois, joursMois);

  const lundiProchain = decalageJours(lundiDeLaSemaine(formaterDateLocale(new Date())), 7);
  const vendrediProchain = decalageJours(lundiProchain, 4);
  const absencesSemaineProchaine = absences.filter(a =>
    a.date_fin >= lundiProchain && a.date_debut <= vendrediProchain
  );
  const rh = calculerBilanRh(employes, absencesSemaineProchaine, lundiProchain, vendrediProchain);

  return {
    periode: {
      mois: moisStr,
      label: libelleMois(moisStr),
      date_debut: dateDebut,
      date_fin: dateFin,
      semaines
    },
    conformite,
    occupation,
    rh: {
      ...rh,
      semaineLabel: `${parseDateLocale(lundiProchain).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} – ${parseDateLocale(vendrediProchain).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
  };
}

async function genererPdfMensuel(clinicId, moisStr) {
  const data = await getTableauDeBord(clinicId, moisStr);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).fillColor('#1D1D1F').text('SMR Planner', { align: 'center' });
    doc.fontSize(14).fillColor('#5C6370').text(`Rapport mensuel — ${data.periode.label}`, { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(16).fillColor('#007AFF').text('Indicateurs clés');
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#1D1D1F');
    doc.text(`Score de conformité moyen : ${data.conformite.scoreMoyen}%`);
    doc.text(`Patients évalués : ${data.conformite.patientsEvalues} (${data.conformite.patientsConformes} conformes)`);
    doc.text(`Heures de soins planifiées : ${data.conformite.heuresPlanifiees} h`);
    doc.text(`Taux d'occupation : ${data.occupation.tauxOccupation}%`);
    doc.text(`Séances planifiées : ${data.occupation.seancesPlanifiees}`);
    doc.moveDown(1);

    doc.fontSize(16).fillColor('#007AFF').text('Conformité par patient');
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#1D1D1F');
    if (!data.conformite.patients.length) {
      doc.text('Aucun patient avec forfait défini.');
    } else {
      data.conformite.patients.forEach(p => {
        doc.text(`• ${p.nom} : ${p.score}% (${p.heuresPlanifiees} h / ${p.heuresForfait} h)`);
      });
    }
    doc.moveDown(1);

    doc.fontSize(16).fillColor('#007AFF').text(`Bilan RH — semaine du ${data.rh.semaineLabel}`);
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#1D1D1F');
    doc.text(`Taux de présence prévu : ${data.rh.tauxPresence}%`);
    doc.text(`En congé : ${data.rh.enConge} · Arrêt maladie : ${data.rh.enArret} · Formation : ${data.rh.enFormation}`);
    doc.text(`Équipe au complet : ${data.rh.equipeAuComplet ? 'Oui' : 'Non'}`);
    doc.moveDown(0.5);
    doc.fontSize(10);
    data.rh.details.forEach(d => {
      doc.text(`• ${d.prenom} ${d.nom} (${d.roleLabel}) — ${d.label} : ${d.detail}`);
    });

    doc.moveDown(+2);
    doc.fontSize(9).fillColor('#8A93A3').text(
      `Document généré le ${new Date().toLocaleDateString('fr-FR')} — SMR Planner`,
      { align: 'center' }
    );

    doc.end();
  });
}

module.exports = {
  getTableauDeBord,
  genererPdfMensuel,
  moisCourant
};
