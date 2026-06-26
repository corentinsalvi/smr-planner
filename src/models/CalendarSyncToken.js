const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const apiJsonPlugin = require('./plugins/apiJson');

const calendarSyncTokenSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, default: uuidv4 },
  clinic_id: { type: String, required: true, index: true },
  employe_id: { type: String, required: true, index: true },
  sync_uuid: { type: String, required: true },
  token_hash: { type: String, required: true },
  actif: { type: Boolean, default: true },
  revoked_at: { type: String, default: null },
  created_at: { type: String, default: () => new Date().toISOString() },
  last_accessed_at: { type: String, default: null }
});

calendarSyncTokenSchema.plugin(apiJsonPlugin);

module.exports = mongoose.model('CalendarSyncToken', calendarSyncTokenSchema);
