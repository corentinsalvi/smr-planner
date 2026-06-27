function verifierConfigurationSecurite() {
  const avertissements = [];

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'changez_moi_en_production') {
    avertissements.push('JWT_SECRET non configuré ou valeur par défaut — changez-le en production.');
  }

  if (!process.env.MONGO_URI) {
    avertissements.push('MONGO_URI manquant — la connexion MongoDB échouera.');
  }

  if (process.env.NODE_ENV === 'production' && !process.env.TRUST_PROXY) {
    avertissements.push('TRUST_PROXY=true recommandé derrière un reverse proxy (Docker, nginx).');
  }

  avertissements.forEach(msg => console.warn(`[Sécurité] ${msg}`));
}

module.exports = { verifierConfigurationSecurite };
