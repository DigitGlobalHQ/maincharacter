-- ═══════════════════════════════════════════════════════════════════
-- 0006_audit_session_store.sql — durable audit-session KV store
-- ═══════════════════════════════════════════════════════════════════
--
-- Root cause: routes/lookmaxing.js stored audit sessions in
-- data/audit-sessions-v2.json on Render's ephemeral disk.  Every
-- redeploy or free-instance restart wiped that file, making
-- _getSession() return null at /pay/order, /pay/verify, /pay/subscribe,
-- /pay/test-confirm, GET /audit/:id, and GET /audit/:id/pdf.
-- Users were left stuck at payment or forced to re-upload their photo.
--
-- Fix: a plain TEXT-keyed blob table.  The full session object is stored
-- in JSONB `data` (schemaless — _updateSession adds arbitrary fields
-- like photoB64, pendingReferralCode, aestheticScores, report, pdfBase64).
-- id, user_id, and paid are mirrored into their own columns for fast
-- admin queries and index scans without unpacking JSONB.
--
-- NOTE: do NOT use the existing audit_sessions_v2 table (migration 0002).
-- That table has id UUID + user_id UUID REFERENCES users(id), which does
-- NOT match how routes/lookmaxing.js keys sessions (plain TEXT, no FK).
-- This table is a simple KV store that mirrors the file-backend contract.

CREATE TABLE IF NOT EXISTS audit_session_store (
  id          TEXT        PRIMARY KEY,
  user_id     TEXT,
  paid        BOOLEAN     NOT NULL DEFAULT FALSE,
  data        JSONB       NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_session_store_user_id_idx ON audit_session_store (user_id);

-- ─── Record this migration ───────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES (6) ON CONFLICT DO NOTHING;
