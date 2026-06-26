const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const apiJsonPlugin = require('./plugins/apiJson');

const clinicSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, default: uuidv4 },
  nom: { type: String, required: true },
  slug: { type: String, required: true, unique: true },
  timezone: { type: String, default: 'Europe/Paris' },
  actif: { type: Boolean, default: true },
  created_at: { type: String, default: () => new Date().toISOString() }
});

clinicSchema.plugin(apiJsonPlugin);

module.exports = mongoose.model('Clinic', clinicSchema);
