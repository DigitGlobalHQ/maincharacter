/**
 * tests/referral-codes.test.js
 * Unit tests for the referral-codes model.
 * Tests: create → validate → redeem → exhaust; inactive / unknown codes;
 * redeem past limit returns ok:false; maxUses:3 allows 3 then fails.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-refcodes-'));
process.env.REFERRAL_CODES_FILE_PATH = path.join(tmpDir, 'referral-codes.json');

// Dynamic import AFTER env is set (model resolves path at load time).
const ReferralCodes = await import('../models/referral-codes.js').then((m) => m.default || m);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('ReferralCodes model', () => {
  describe('createCode', () => {
    it('returns a code record with expected shape', async () => {
      const rec = await ReferralCodes.createCode({ percentOff: 20, maxUses: 1, note: 'test' });
      expect(rec.code).toBeTruthy();
      expect(rec.code).toMatch(/^[A-Z0-9]{8}$/);
      expect(rec.percentOff).toBe(20);
      expect(rec.maxUses).toBe(1);
      expect(rec.uses).toBe(0);
      expect(rec.active).toBe(true);
      expect(rec.note).toBe('test');
      expect(rec.createdAt).toBeTruthy();
    });

    it('generates unique codes across calls', async () => {
      const a = await ReferralCodes.createCode({ percentOff: 10, maxUses: 1 });
      const b = await ReferralCodes.createCode({ percentOff: 10, maxUses: 1 });
      expect(a.code).not.toBe(b.code);
    });

    it('defaults maxUses to 1 when not supplied', async () => {
      const rec = await ReferralCodes.createCode({ percentOff: 50 });
      expect(rec.maxUses).toBe(1);
    });
  });

  describe('listCodes', () => {
    it('returns an array that includes created codes', async () => {
      const rec = await ReferralCodes.createCode({ percentOff: 15, maxUses: 2 });
      const list = await ReferralCodes.listCodes();
      expect(Array.isArray(list)).toBe(true);
      const found = list.find((c) => c.code === rec.code);
      expect(found).toBeTruthy();
    });
  });

  describe('getCode', () => {
    it('retrieves a code case-insensitively', async () => {
      const rec = await ReferralCodes.createCode({ percentOff: 30, maxUses: 1 });
      const byUpper = await ReferralCodes.getCode(rec.code.toUpperCase());
      const byLower = await ReferralCodes.getCode(rec.code.toLowerCase());
      expect(byUpper).toBeTruthy();
      expect(byLower).toBeTruthy();
      expect(byUpper.code).toBe(rec.code);
    });

    it('returns null for unknown code', async () => {
      const result = await ReferralCodes.getCode('NOTEXIST');
      expect(result).toBeNull();
    });
  });

  describe('validateCode', () => {
    it('returns valid:true for a fresh code', async () => {
      const rec = await ReferralCodes.createCode({ percentOff: 25, maxUses: 1 });
      const v = await ReferralCodes.validateCode(rec.code);
      expect(v.valid).toBe(true);
      expect(v.percentOff).toBe(25);
      expect(v.maxUses).toBe(1);
      expect(v.uses).toBe(0);
    });

    it('returns valid:false with reason for unknown code', async () => {
      const v = await ReferralCodes.validateCode('XXXXXXXX');
      expect(v.valid).toBe(false);
      expect(v.reason).toBeTruthy();
    });

    it('returns valid:false for inactive code', async () => {
      const rec = await ReferralCodes.createCode({ percentOff: 10, maxUses: 1 });
      // Manually deactivate
      const store = JSON.parse(fs.readFileSync(process.env.REFERRAL_CODES_FILE_PATH, 'utf8'));
      store[rec.code].active = false;
      fs.writeFileSync(process.env.REFERRAL_CODES_FILE_PATH, JSON.stringify(store, null, 2));

      const v = await ReferralCodes.validateCode(rec.code);
      expect(v.valid).toBe(false);
      expect(v.reason).toMatch(/inactive/i);
    });

    it('returns valid:false when uses >= maxUses', async () => {
      const rec = await ReferralCodes.createCode({ percentOff: 10, maxUses: 1 });
      await ReferralCodes.redeemCode(rec.code);
      const v = await ReferralCodes.validateCode(rec.code);
      expect(v.valid).toBe(false);
      expect(v.reason).toMatch(/exhaust|used|limit/i);
    });
  });

  describe('redeemCode — maxUses:1', () => {
    it('succeeds on first redeem', async () => {
      const rec = await ReferralCodes.createCode({ percentOff: 40, maxUses: 1 });
      const result = await ReferralCodes.redeemCode(rec.code);
      expect(result.ok).toBe(true);
    });

    it('fails on second redeem (exhausted)', async () => {
      const rec = await ReferralCodes.createCode({ percentOff: 40, maxUses: 1 });
      await ReferralCodes.redeemCode(rec.code);
      const result = await ReferralCodes.redeemCode(rec.code);
      expect(result.ok).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it('increments uses count after a successful redeem', async () => {
      const rec = await ReferralCodes.createCode({ percentOff: 10, maxUses: 1 });
      await ReferralCodes.redeemCode(rec.code);
      const updated = await ReferralCodes.getCode(rec.code);
      expect(updated.uses).toBe(1);
    });
  });

  describe('redeemCode — maxUses:3', () => {
    it('allows exactly 3 redeems then fails on 4th', async () => {
      const rec = await ReferralCodes.createCode({ percentOff: 15, maxUses: 3 });

      const r1 = await ReferralCodes.redeemCode(rec.code);
      expect(r1.ok).toBe(true);

      const r2 = await ReferralCodes.redeemCode(rec.code);
      expect(r2.ok).toBe(true);

      const r3 = await ReferralCodes.redeemCode(rec.code);
      expect(r3.ok).toBe(true);

      const r4 = await ReferralCodes.redeemCode(rec.code);
      expect(r4.ok).toBe(false);
    });
  });

  describe('redeemCode — unknown code', () => {
    it('returns ok:false for a code that does not exist', async () => {
      const result = await ReferralCodes.redeemCode('BADCODE1');
      expect(result.ok).toBe(false);
      expect(result.reason).toBeTruthy();
    });
  });
});
