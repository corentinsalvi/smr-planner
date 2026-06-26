const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const apiJsonPlugin = require('./plugins/apiJson');

const patientSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, default: uuidv4 },
  clinic_id: { type: String, required: true, index: true },
  nom: { type: String, required: true },
  prenom: { type: String, required: true },
  date_naissance: { type: String, default: null },
  date_entree: { type: String, default: null },
  date_sortie_prevue: { type: String, default: null },
  statut: { type: String, default: 'ACTIF' },
  notes: { type: String, default: '' },
  created_at: { type: String, default: () => new Date().toISOString() }
});

patientSchema.plugin(apiJsonPlugin);

module.exports = mongoose.model('Patient', patientSchema);
