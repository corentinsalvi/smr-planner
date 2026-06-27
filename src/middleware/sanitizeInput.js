const xss = require('xss');

const CHAMPS_EXCLUS = new Set(['mot_de_passe', 'password', 'token', 'token_hash']);

function nettoyerChaine(chaine) {
  return xss(chaine.trim(), { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ['script', 'style'] });
}

function nettoyerValeur(valeur, cle = '') {
  if (CHAMPS_EXCLUS.has(cle)) return valeur;
  if (typeof valeur === 'string') return nettoyerChaine(valeur);
  if (Array.isArray(valeur)) return valeur.map((item, index) => nettoyerValeur(item, `${cle}[${index}]`));
  if (valeur && typeof valeur === 'object') return nettoyerObjet(valeur);
  return valeur;
}

function nettoyerObjet(objet) {
  const resultat = {};
  for (const [cle, valeur] of Object.entries(objet)) {
    resultat[cle] = nettoyerValeur(valeur, cle);
  }
  return resultat;
}

function sanitizeInput(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = nettoyerObjet(req.body);
  }

  if (req.params && typeof req.params === 'object') {
    for (const [cle, valeur] of Object.entries(req.params)) {
      if (typeof valeur === 'string' && !CHAMPS_EXCLUS.has(cle)) {
        req.params[cle] = nettoyerChaine(valeur);
      }
    }
  }

  next();
}

module.exports = { sanitizeInput, nettoyerChaine, nettoyerObjet };
