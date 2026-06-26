const express = require('express');
const router = express.Router();
const requireRole = require('../middleware/requireRole');
const { DIRECTEUR_ROLES } = require('../constants');
const { getTableauDeBord, genererPdfMensuel, moisCourant } = require('../services/rapportService');
const { getClinicIdFromRequest } = require('../utils/clinicScope');

router.use(requireRole(...DIRECTEUR_ROLES));

router.get('/tableau-de-bord', async (req, res) => {
  const mois = req.query.mois || moisCourant();
  if (!/^\d{4}-\d{2}$/.test(mois)) {
    return res.status(400).json({ erreur: 'Paramètre mois invalide (format YYYY-MM).' });
  }
  const clinicId = getClinicIdFromRequest(req);
  res.json(await getTableauDeBord(clinicId, mois));
});

router.get('/mensuel.pdf', async (req, res) => {
  const mois = req.query.mois || moisCourant();
  if (!/^\d{4}-\d{2}$/.test(mois)) {
    return res.status(400).json({ erreur: 'Paramètre mois invalide (format YYYY-MM).' });
  }

  try {
    const clinicId = getClinicIdFromRequest(req);
    const pdf = await genererPdfMensuel(clinicId, mois);
    const [annee, m] = mois.split('-');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="rapport-smr-${annee}-${m}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ erreur: 'Erreur lors de la génération du rapport PDF.' });
  }
});

module.exports = router;
