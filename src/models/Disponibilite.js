const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const apiJsonPlugin = require('./plugins/apiJson');

const disponibiliteSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, default: uuidv4 },
  clinic_id: { type: String, required: true, index: true },
  employe_id: { type: String, required: true, index: true },
  jour_semaine: { type: String, required: true },
  heure_debut: { type: String, required: true },
  heure_fin: { type: String, required: true }
});

disponibiliteSchema.plugin(apiJsonPlugin);

module.exports = mongoose.model('Disponibilite', disponibiliteSchema);
