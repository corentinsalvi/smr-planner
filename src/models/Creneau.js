const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const apiJsonPlugin = require('./plugins/apiJson');

const creneauSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, default: uuidv4 },
  clinic_id: { type: String, required: true, index: true },
  patient_id: { type: String, default: null, index: true },
  patient_ids: { type: [String], default: [] },
  type: { type: String, default: 'SEANCE', enum: ['SEANCE', 'ATELIER'] },
  employe_id: { type: String, required: true, index: true },
  role: { type: String, default: null },
  besoin_soin_id: { type: String, default: null },
  date: { type: String, required: true, index: true },
  heure_debut: { type: String, required: true },
  heure_fin: { type: String, required: true },
  statut: { type: String, default: 'PLANIFIE' },
  genere_auto: { type: Boolean, default: false },
  notes: { type: String, default: '' },
  created_at: { type: String, default: () => new Date().toISOString() }
});

creneauSchema.index({ clinic_id: 1, date: 1 });
creneauSchema.plugin(apiJsonPlugin);

module.exports = mongoose.model('Creneau', creneauSchema);
