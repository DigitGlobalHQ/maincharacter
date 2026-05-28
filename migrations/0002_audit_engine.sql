-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0002 — Lookmaxxing Audit Engine (Stage-1)
-- Adds audit_sessions_v2 for guest + authenticated audit flow.
-- Adds paywall_credits to users for the ₹99-toward-month-one credit.
-- Cited spec: briefs/stage-1-audit-spec.md §8.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── audit_sessions_v2 ───────────────────────────────────────────────────────
-- Every row is owned by either guest_id (anonymous) or user_id (authenticated).
-- The constraint ensures no orphaned rows.
CREATE TABLE IF NOT EXISTS audit_sessions_v2 (
  id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  guest_id             UUID,
  user_id              UUID        REFERENCES users(id) ON DELETE SET NULL,
  quiz_answers         JSONB,
  photo_storage_key    TEXT,
  gemini_report        JSONB,
  paid                 BOOLEAN     NOT NULL DEFAULT FALSE,
  paid_at              TIMESTAMPTZ,
  razorpay_payment_id  TEXT,
  consent_18plus       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at           TIMESTAMPTZ,
  CONSTRAINT audit_sessions_v2_owner_check
    CHECK (guest_id IS NOT NULL OR user_id IS NOT NULL)
);

-- Indexes for the main access patterns.
CREATE INDEX IF NOT EXISTS audit_sessions_v2_guest_id_idx
  ON audit_sessions_v2 (guest_id)
  WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_sessions_v2_user_id_idx
  ON audit_sessions_v2 (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS audit_sessions_v2_paid_created_idx
  ON audit_sessions_v2 (paid, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_sessions_v2_expires_idx
  ON audit_sessions_v2 (expires_at)
  WHERE expires_at IS NOT NULL;

-- Trigger: when a guest row is inserted (guest_id NOT NULL, user_id IS NULL),
-- auto-set expires_at = created_at + 24 hours.  User-owned rows (user_id NOT NULL)
-- get NULL expires_at — they live forever.
CREATE OR REPLACE FUNCTION audit_sessions_v2_set_expiry()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.guest_id IS NOT NULL AND NEW.user_id IS NULL AND NEW.expires_at IS NULL THEN
    NEW.expires_at := NEW.created_at + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$;

-- Drop + re-create the trigger so re-running the migration is safe.
DROP TRIGGER IF EXISTS trg_audit_sessions_v2_expiry ON audit_sessions_v2;
CREATE TRIGGER trg_audit_sessions_v2_expiry
  BEFORE INSERT ON audit_sessions_v2
  FOR EACH ROW EXECUTE FUNCTION audit_sessions_v2_set_expiry();

-- ─── data_rights_log (for guest_merge audit trail) ───────────────────────────
-- Create only if absent — 0001 may already have it in some installations.
CREATE TABLE IF NOT EXISTS data_rights_log (
  id         UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID,
  action     TEXT        NOT NULL,
  props      JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS data_rights_log_user_id_idx
  ON data_rights_log (user_id)
  WHERE user_id IS NOT NULL;

-- ─── paywall_credits on users ─────────────────────────────────────────────────
-- ₹99 audit payment credits toward the first month's subscription.
-- ADD COLUMN IF NOT EXISTS (Postgres 9.6+) is idempotent.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS paywall_credits INTEGER NOT NULL DEFAULT 0;

-- ─── Record this migration ────────────────────────────────────────────────────
INSERT INTO schema_migrations (version) VALUES (2) ON CONFLICT DO NOTHING;
