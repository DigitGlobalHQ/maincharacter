-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0001 — Initial schema for MainCharacter Postgres backend
-- Applies when DATABASE_URL is set (Neon Postgres, Singapore region).
-- All tables are CREATE TABLE IF NOT EXISTS so the migration is idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

-- Track which migrations have run
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── users ───────────────────────────────────────────────────────────────────
-- Mirrors the JSON shape in models/User.js.  Extra columns (lookmaxBaseline)
-- are JSONB so the audit-axis snapshot can be stored without a fixed schema.
CREATE TABLE IF NOT EXISTS users (
  id                       UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token                    UUID        NOT NULL UNIQUE,
  name                     TEXT        NOT NULL,
  phone                    TEXT        NOT NULL UNIQUE,
  email                    TEXT,
  pillar                   TEXT        NOT NULL DEFAULT 'orator',
  preferred_time           TEXT        NOT NULL DEFAULT '08:00',
  enrolled_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  day                      INTEGER     NOT NULL DEFAULT 0,
  status                   TEXT        NOT NULL DEFAULT 'active',
  trial_complete           BOOLEAN     NOT NULL DEFAULT FALSE,
  awaiting_response        BOOLEAN     NOT NULL DEFAULT FALSE,
  last_morning_sent        TEXT,
  last_evening_sent        TEXT,
  scores                   JSONB       NOT NULL DEFAULT '[]',
  words_learned            JSONB       NOT NULL DEFAULT '[]',
  chronicle                JSONB       NOT NULL DEFAULT '[]',
  rank                     TEXT        NOT NULL DEFAULT 'unawakened',
  streak                   INTEGER     NOT NULL DEFAULT 0,
  last_active              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  subscription_status      TEXT        NOT NULL DEFAULT 'trial',
  razorpay_customer_id     TEXT,
  razorpay_subscription_id TEXT,
  notes                    TEXT        NOT NULL DEFAULT '',
  -- Lookmaxxing / Aura++
  orator_active            BOOLEAN     NOT NULL DEFAULT FALSE,
  lookmaxxing_active       BOOLEAN     NOT NULL DEFAULT FALSE,
  mirror_level             TEXT        NOT NULL DEFAULT 'raw',
  audit_session_id         TEXT,
  lookmaxxing_started_at   TIMESTAMPTZ,
  orator_started_at        TIMESTAMPTZ,
  push_subscription        JSONB,
  lookmax_baseline         JSONB,
  lookmax_streak           INTEGER     NOT NULL DEFAULT 0,
  lookmax_protocol_streak  INTEGER     NOT NULL DEFAULT 0,
  last_mirror_at           TIMESTAMPTZ,
  -- Login Gate
  magic_link_token         TEXT,
  magic_link_expires_at    BIGINT,
  magic_link_consumed_at   TEXT,
  first_login_token        TEXT,
  first_login_expires_at   BIGINT,
  first_login_consumed_at  TEXT,
  -- Timestamps
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_token_idx  ON users (token);
CREATE INDEX IF NOT EXISTS users_phone_idx  ON users (phone);
CREATE INDEX IF NOT EXISTS users_email_idx  ON users (email);
CREATE INDEX IF NOT EXISTS users_razorpay_sub_idx ON users (razorpay_subscription_id);

-- ─── audit_sessions ───────────────────────────────────────────────────────────
-- Mirrors models/AuditSession.js.  Expires after 24 h (enforced by application
-- code + a periodic purger; expires_at is stored for future DB-level cleanup).
CREATE TABLE IF NOT EXISTS audit_sessions (
  id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_token   TEXT        NOT NULL UNIQUE,
  intent          TEXT,
  re_audit        BOOLEAN     NOT NULL DEFAULT FALSE,
  user_token      TEXT,
  quiz_answers    JSONB,
  photos          JSONB       NOT NULL DEFAULT '[]',
  aesthetic_scores JSONB,
  weakest_axis    TEXT,
  hair_receding   JSONB,
  diagnosis       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);

CREATE INDEX IF NOT EXISTS audit_sessions_token_idx ON audit_sessions (session_token);
CREATE INDEX IF NOT EXISTS audit_sessions_expires_idx ON audit_sessions (expires_at);

-- ─── early_access ─────────────────────────────────────────────────────────────
-- Mirrors models/EarlyAccess.js.  Waitlist captured while PAYWALL_PUBLIC=false.
CREATE TABLE IF NOT EXISTS early_access (
  id                         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone                      TEXT        NOT NULL UNIQUE,
  name                       TEXT        NOT NULL DEFAULT '',
  source_audit_session_token TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS early_access_phone_idx ON early_access (phone);

-- ─── events ───────────────────────────────────────────────────────────────────
-- Durable backing for services/events.js.  Props stored as JSONB for fast
-- key-level querying.  Indexed on three common access patterns.
CREATE TABLE IF NOT EXISTS events (
  id        TEXT        NOT NULL PRIMARY KEY,
  ts        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name      TEXT        NOT NULL,
  user_id   TEXT,
  anon_id   TEXT,
  props     JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS events_name_ts_idx    ON events (name, ts DESC);
CREATE INDEX IF NOT EXISTS events_user_ts_idx    ON events (user_id, ts DESC) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS events_anon_ts_idx    ON events (anon_id, ts DESC) WHERE anon_id IS NOT NULL;

-- ─── Record this migration ───────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;
