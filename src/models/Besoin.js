const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const apiJsonPlugin = require('./plugins/apiJson');

const besoinSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, default: uuidv4 },
  clinic_id: { type: String, required: true, index: true },
  patient_id: { type: String, required: true, index: true },
  role: { type: String, required: true },
  seances_par_semaine: { type: Number, required: true },
  priorite: { type: Number, default: 5 },
  professionnel_prefere_id: { type: String, default: null },
  actif: { type: Boolean, default: true },
  created_at: { type: String, default: () => new Date().toISOString() }
});

besoinSchema.plugin(apiJsonPlugin);

module.exports = mongoose.model('Besoin', besoinSchema);
