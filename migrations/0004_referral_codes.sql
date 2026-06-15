-- ═══════════════════════════════════════════════════════════════════
-- 0004_referral_codes.sql — admin-generated referral discount codes
-- ═══════════════════════════════════════════════════════════════════
--
-- Backs models/referral-codes.js. Without this table the codes live only in
-- data/referral-codes.json, which Render's ephemeral disk wipes on every
-- redeploy/restart (the LAERVVKE bug: a code generated before a redeploy
-- vanished and read as "not found"). With DATABASE_URL set, codes persist.
--
-- code is stored UPPERCASE; the model uppercases all lookups so matching is
-- case-insensitive. uses is incremented atomically on redemption.

CREATE TABLE IF NOT EXISTS referral_codes (
  code         TEXT        PRIMARY KEY,
  percent_off  INTEGER     NOT NULL,
  max_uses     INTEGER     NOT NULL DEFAULT 1,
  uses         INTEGER     NOT NULL DEFAULT 0,
  active       BOOLEAN     NOT NULL DEFAULT TRUE,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
