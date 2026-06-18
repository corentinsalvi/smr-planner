/**
 * Schéma de référence — Jetons de synchronisation calendrier (iCal)
 *
 * ── PostgreSQL ──────────────────────────────────────────────────────────────
 *
 * CREATE TABLE calendar_sync_tokens (
 *   id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   employe_id      UUID NOT NULL REFERENCES employes(id) ON DELETE CASCADE,
 *   sync_uuid       UUID NOT NULL UNIQUE,          -- UUID v4 visible dans l'URL
 *   token_hash      CHAR(64) NOT NULL,             -- SHA-256 du secret (jamais le secret en clair)
 *   actif           BOOLEAN NOT NULL DEFAULT TRUE,
 *   revoked_at      TIMESTAMPTZ,
 *   created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *   last_accessed_at TIMESTAMPTZ,
 *   CONSTRAINT uq_employe_sync_actif UNIQUE (employe_id) WHERE (actif = TRUE)
 * );
 *
 * CREATE INDEX idx_calendar_sync_uuid ON calendar_sync_tokens(sync_uuid) WHERE actif = TRUE;
 *
 * ── MongoDB / Mongoose ──────────────────────────────────────────────────────
 *
 * const CalendarSyncTokenSchema = new Schema({
 *   employe_id:       { type: String, required: true, index: true },
 *   sync_uuid:        { type: String, required: true, unique: true },
 *   token_hash:       { type: String, required: true },  // SHA-256 hex
 *   actif:            { type: Boolean, default: true },
 *   revoked_at:       { type: Date, default: null },
 *   created_at:       { type: Date, default: Date.now },
 *   last_accessed_at: { type: Date, default: null }
 * });
 *
 * CalendarSyncTokenSchema.index(
 *   { employe_id: 1 },
 *   { unique: true, partialFilterExpression: { actif: true } }
 * );
 *
 * ── Implémentation actuelle (JSON / data/calendar_sync_tokens.json) ─────────
 *
 * {
 *   id:               string (UUID),
 *   employe_id:       string (UUID),
 *   sync_uuid:        string (UUID v4),
 *   token_hash:       string (SHA-256 hex du secret),
 *   actif:            boolean,
 *   revoked_at:       string | null (ISO 8601),
 *   created_at:       string (ISO 8601),
 *   last_accessed_at: string | null (ISO 8601)
 * }
 */

module.exports = {};
