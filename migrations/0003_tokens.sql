-- 0003_tokens.sql
-- Token/credits balance for the paid AI image tools (₹499 = 50 tokens).
-- Idempotent: safe to re-run.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tokens INTEGER NOT NULL DEFAULT 0;
