const TEMPS_PLANNING = {
  DUREE_SEANCE_MIN: 45,
  PAUSE_ENTRE_SEANCES_MIN: 5,
  DUREE_BLOC_MIN: 50,
  PAS_MINUTES: 5
};

const REGLES_PLANNING = {
  PLAFOND_SEANCES_JOUR: 3,
  MAX_ENCHAINEMENT_INTENSIF: 2,
  ROLES_INTENSIFS: ['KINESITHERAPEUTE', 'ERGOTHERAPEUTE', 'ORTHOPHONISTE'],
  ROLES_PASSIFS: ['DIETETICIEN', 'ASSISTANTE_SOCIALE', 'NEUROPSYCHOLOGUE']
};

const ROLES = {
  MEDECIN_SMR: { label: 'Médecin SMR', couleur: '#007AFF' },
  KINESITHERAPEUTE: { label: 'Kinésithérapeute', couleur: '#34AADC' },
  ERGOTHERAPEUTE: { label: 'Ergothérapeute', couleur: '#5856D6' },
  ORTHOPHONISTE: { label: 'Orthophoniste', couleur: '#5AC8FA' },
  NEUROPSYCHOLOGUE: { label: 'Neuropsychologue', couleur: '#AF52DE' },
  DIETETICIEN: { label: 'Diététicien', couleur: '#FF9500' },
  ASSISTANTE_SOCIALE: { label: 'Assistante sociale', couleur: '#FF2D55' },
  IDE_COORDINATRICE: { label: 'IDE coordinatrice', couleur: '#004999' },
  AIDE_SOIGNANT: { label: 'Aide-soignant', couleur: '#64D2FF' }
};

const JOURS_SEMAINE = [
  { numero: 1, label: 'Lundi', abrev: 'Lun' },
  { numero: 2, label: 'Mardi', abrev: 'Mar' },
  { numero: 3, label: 'Mercredi', abrev: 'Mer' },
  { numero: 4, label: 'Jeudi', abrev: 'Jeu' },
  { numero: 5, label: 'Vendredi', abrev: 'Ven' }
];

const GESTIONNAIRE_ROLES = ['IDE_COORDINATRICE'];

const TYPES_ABSENCE = {
  CONGE: { label: 'Congé', couleur: '#FF9500' },
  ARRET_MALADIE: { label: 'Arrêt maladie', couleur: '#FF3B30' },
  FORMATION: { label: 'Formation', couleur: '#5856D6' }
};

module.exports = { ROLES, JOURS_SEMAINE, REGLES_PLANNING, TEMPS_PLANNING, GESTIONNAIRE_ROLES, TYPES_ABSENCE };
