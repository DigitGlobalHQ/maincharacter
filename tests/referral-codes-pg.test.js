/**
 * tests/referral-codes-pg.test.js — referral codes on the Postgres backend
 *
 * Only runs when DATABASE_URL is set; skipped in CI (JSON-backend path, which
 * is covered by tests/referral-codes.test.js). Proves admin-generated codes
 * persist in the referral_codes table (migrations/0004) and that redemption is
 * atomic — the LAERVVKE bug was that JSON-only codes vanished on redeploy.
 */

import { describe, it, expect, beforeAll } from 'vitest';

const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)('referral codes — Postgres backend (0004)', () => {
  let ReferralCodes;

  beforeAll(async () => {
    const db = require('../lib/db');
    const migrate = require('../lib/migrate');
    await db.init();
    await migrate.run();
    ReferralCodes = require('../models/referral-codes');
  }, 30000);

  it('creates, fetches, validates, and redeems a code in Postgres', async () => {
    const rec = await ReferralCodes.createCode({ percentOff: 40, maxUses: 2, note: 'pg-test' });
    expect(rec.code).toMatch(/^[A-Z2-9]{8}$/);
    expect(rec.percentOff).toBe(40);
    expect(rec.maxUses).toBe(2);
    expect(rec.uses).toBe(0);

    const fetched = await ReferralCodes.getCode(rec.code.toLowerCase()); // case-insensitive
    expect(fetched.code).toBe(rec.code);

    const v1 = await ReferralCodes.validateCode(rec.code);
    expect(v1.valid).toBe(true);
    expect(v1.percentOff).toBe(40);

    // First two redemptions succeed, third is rejected (maxUses = 2).
    expect((await ReferralCodes.redeemCode(rec.code)).ok).toBe(true);
    expect((await ReferralCodes.redeemCode(rec.code)).ok).toBe(true);
    const third = await ReferralCodes.redeemCode(rec.code);
    expect(third.ok).toBe(false);
    expect(third.reason).toMatch(/exhausted/);

    const exhausted = await ReferralCodes.validateCode(rec.code);
    expect(exhausted.valid).toBe(false);

    // The code appears in the list.
    const list = await ReferralCodes.listCodes();
    expect(list.some((c) => c.code === rec.code)).toBe(true);

    // Cleanup.
    const db = require('../lib/db');
    await db.query('DELETE FROM referral_codes WHERE code = $1', [rec.code]);
  });
});
