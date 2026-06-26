const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const apiJsonPlugin = require('./plugins/apiJson');

const employeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, default: uuidv4 },
  clinic_id: { type: String, required: true, index: true },
  nom: { type: String, required: true },
  prenom: { type: String, required: true },
  email: { type: String, required: true },
  mot_de_passe_hash: { type: String, required: true },
  role: { type: String, required: true },
  actif: { type: Boolean, default: true },
  created_at: { type: String, default: () => new Date().toISOString() }
});

employeSchema.index({ clinic_id: 1, email: 1 }, { unique: true });
employeSchema.plugin(apiJsonPlugin);

module.exports = mongoose.model('Employe', employeSchema);
