const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_non_securise';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

async function hashMotDePasse(motDePasseClair) {
  const sel = await bcrypt.genSalt(10);
  return bcrypt.hash(motDePasseClair, sel);
}

async function verifierMotDePasse(motDePasseClair, hash) {
  return bcrypt.compare(motDePasseClair, hash);
}

function genererToken(employe) {
  return jwt.sign(
    {
      id: employe.id,
      clinic_id: employe.clinic_id,
      role: employe.role,
      email: employe.email,
      nom: employe.nom,
      prenom: employe.prenom
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifierToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { hashMotDePasse, verifierMotDePasse, genererToken, verifierToken };
