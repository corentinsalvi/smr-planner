const Clinic = require('../models/Clinic');

const DEFAULT_CLINIC_SLUG = 'clinique-smr';
let cachedDefaultClinicId = null;

async function initDefaultClinic() {
  const clinic = await Clinic.findOne({ slug: DEFAULT_CLINIC_SLUG }).lean();
  cachedDefaultClinicId = clinic?.id || null;
}

async function getDefaultClinicId() {
  if (cachedDefaultClinicId) return cachedDefaultClinicId;
  const clinic = await Clinic.findOne({ slug: DEFAULT_CLINIC_SLUG }).lean();
  if (!clinic) {
    throw new Error(`Clinique par défaut introuvable (slug: ${DEFAULT_CLINIC_SLUG}). Lancez npm run seed.`);
  }
  cachedDefaultClinicId = clinic.id;
  return clinic.id;
}

function getClinicIdFromRequest(req) {
  return req.utilisateur?.clinic_id || cachedDefaultClinicId;
}

module.exports = { DEFAULT_CLINIC_SLUG, initDefaultClinic, getDefaultClinicId, getClinicIdFromRequest };
