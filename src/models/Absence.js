const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const apiJsonPlugin = require('./plugins/apiJson');

const absenceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, default: uuidv4 },
  clinic_id: { type: String, required: true, index: true },
  employe_id: { type: String, required: true, index: true },
  type: { type: String, required: true },
  date_debut: { type: String, required: true },
  date_fin: { type: String, required: true },
  journee_entiere: { type: Boolean, default: true },
  heure_debut: { type: String, default: null },
  heure_fin: { type: String, default: null },
  commentaire: { type: String, default: '' },
  created_at: { type: String, default: () => new Date().toISOString() },
  created_by: { type: String, default: null }
});

absenceSchema.plugin(apiJsonPlugin);

module.exports = mongoose.model('Absence', absenceSchema);
