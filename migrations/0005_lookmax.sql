-- ═══════════════════════════════════════════════════════════════════
-- 0005_lookmax.sql — Postgres persistence for Lookmaxxing daily journey
-- ═══════════════════════════════════════════════════════════════════
--
-- Root cause: models/Lookmax.js previously stored ALL data (mirrors,
-- protocols, hair, nightLogs) in data/lookmax/lookmax.json on Render's
-- ephemeral disk.  Every redeploy wiped that file and users lost their
-- daily journey history while their account in the users table survived.
--
-- Fix: two purpose-built tables that cover the four journalling record
-- types (mirror, hair, nightlog → lookmax_records with a `kind` discriminator;
-- protocols → lookmax_protocols with a (user_id, date) PRIMARY KEY because
-- protocols are upserted by date rather than appended).
--
-- OTPs (setOtp/verifyOtp) are intentionally LEFT on the JSON path.
-- They are short-lived login codes (10-minute TTL); their loss on redeploy
-- is inconsequential (user just requests a new OTP). Moving them to Postgres
-- would add two round-trips per login check with negligible durability gain.
--
-- Schema design notes:
--   • user_id TEXT (not UUID FK) mirrors how the rest of the codebase keys
--     Lookmax records — by the users.token value, which is already a UUID
--     stored as TEXT. Avoids a FK constraint that could break if a user
--     record is deleted out-of-order.
--   • payload JSONB — stores the full record shape so the application layer
--     decides field semantics; DDL stays stable even as the payload evolves.
--   • Indexes on (user_id) for all queries; compound (user_id, date) on
--     lookmax_records because all timeline queries filter by both.
-- ═══════════════════════════════════════════════════════════════════

-- ─── lookmax_records ─────────────────────────────────────────────────────────
-- Append-only log for mirror scores, hair readings, and night logs.
-- kind: 'mirror' | 'hair' | 'nightlog'
-- date: IST calendar date (YYYY-MM-DD) of the record (NOT the UTC timestamp).
-- payload: the full JSON shape models/Lookmax.js builds for each kind.

CREATE TABLE IF NOT EXISTS lookmax_records (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    TEXT        NOT NULL,
  kind       TEXT        NOT NULL,
  date       TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lookmax_records_user_idx      ON lookmax_records (user_id);
CREATE INDEX IF NOT EXISTS lookmax_records_user_date_idx ON lookmax_records (user_id, date);
CREATE INDEX IF NOT EXISTS lookmax_records_user_kind_idx ON lookmax_records (user_id, kind);

-- ─── lookmax_protocols ───────────────────────────────────────────────────────
-- One row per (user_id, date): the protocol checklist for a given IST date.
-- Upserted on every setProtocolDay call — last write wins for the same date.
-- payload: the full protocol day shape (items, doNots, isLocked, generatedFrom, createdAt).

CREATE TABLE IF NOT EXISTS lookmax_protocols (
  user_id    TEXT        NOT NULL,
  date       TEXT        NOT NULL,
  payload    JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, date)
);

CREATE INDEX IF NOT EXISTS lookmax_protocols_user_idx ON lookmax_protocols (user_id);

-- ─── Record this migration ───────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES (5) ON CONFLICT DO NOTHING;
