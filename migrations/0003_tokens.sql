-- 0003_tokens.sql
-- Token/credits balance for the paid AI image tools (₹499 = 50 tokens).
-- Idempotent: safe to re-run.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tokens INTEGER NOT NULL DEFAULT 0;

-- Credited payment ids (idempotency guard so return-verify + webhook can't double-credit).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_payments JSONB NOT NULL DEFAULT '[]'::jsonb;
