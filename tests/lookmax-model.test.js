/**
 * tests/lookmax-model.test.js
 *
 * Pure JSON-path regression tests for models/Lookmax.js.
 * DATABASE_URL is explicitly UNSET so these tests ALWAYS run in CI
 * and confirm that the JSON fallback is completely unaffected by the
 * Postgres adapter work.
 *
 * Core regression: mirror history is APPENDED (multiple mirrors for the
 * same user are all retained — this was the ephemeral-disk data-loss bug).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Isolate to a temp dir and force JSON backend (no DATABASE_URL).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lookmax-model-'));
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
// Ensure pg adapter never activates in this suite.
delete process.env.DATABASE_URL;
delete process.env.MC_DB_BACKEND;

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

// Import AFTER env vars are set.
const Lookmax = require('../models/Lookmax');

const UID = 'user-json-test-001';
const UID2 = 'user-json-test-002';

// ── istDate ───────────────────────────────────────────────────────────────────

describe('istDate()', () => {
  it('returns a YYYY-MM-DD string', () => {
    const d = Lookmax.istDate();
    expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('applies +05:30 offset (IST vs UTC)', () => {
    // Midnight UTC on 2026-01-01 = 05:30 IST on 2026-01-01 — still same date.
    const midnight = new Date('2026-01-01T00:00:00.000Z');
    expect(Lookmax.istDate(midnight)).toBe('2026-01-01');

    // 18:31 UTC = 00:01 next day IST.
    const lateEvening = new Date('2026-01-01T18:31:00.000Z');
    expect(Lookmax.istDate(lateEvening)).toBe('2026-01-02');
  });
});

// ── MIRROR — append semantics (core regression) ───────────────────────────────

describe('addMirror / getMirrors — JSON path', () => {
  it('addMirror returns the saved record with an id and date', () => {
    const rec = Lookmax.addMirror(UID, {
      axes: { skinClarity: 60 },
      overallScore: 60,
      mirrorLevel: 'magnetic',
    });
    expect(rec.id).toBeTruthy();
    expect(rec.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(rec.overallScore).toBe(60);
    expect(rec.mirrorLevel).toBe('magnetic');
  });

  it('getMirrors returns an array containing the added record', () => {
    const mirrors = Lookmax.getMirrors(UID);
    expect(Array.isArray(mirrors)).toBe(true);
    expect(mirrors).toHaveLength(1);
  });

  it('REGRESSION: multiple addMirror calls all retain their records (no overwrites)', () => {
    // Second mirror
    Lookmax.addMirror(UID, { axes: { skinClarity: 70 }, overallScore: 70, mirrorLevel: 'magnetic' });
    // Third mirror
    Lookmax.addMirror(UID, { axes: { skinClarity: 80 }, overallScore: 80, mirrorLevel: 'radiant' });

    const mirrors = Lookmax.getMirrors(UID);
    // All three must be present — this is the core append-semantics assertion.
    expect(mirrors).toHaveLength(3);
    expect(mirrors[0].overallScore).toBe(60);
    expect(mirrors[1].overallScore).toBe(70);
    expect(mirrors[2].overallScore).toBe(80);
  });

  it('latestMirror returns the last appended record', () => {
    const latest = Lookmax.latestMirror(UID);
    expect(latest.overallScore).toBe(80);
  });

  it('mirrorForToday returns a record whose date matches today IST', () => {
    const today = Lookmax.istDate();
    const rec = Lookmax.mirrorForToday(UID);
    // All records above were created today.
    expect(rec).not.toBeNull();
    expect(rec.date).toBe(today);
  });

  it('different users have isolated mirror histories', () => {
    Lookmax.addMirror(UID2, { axes: { skinClarity: 50 }, overallScore: 50, mirrorLevel: 'polished' });
    expect(Lookmax.getMirrors(UID)).toHaveLength(3);
    expect(Lookmax.getMirrors(UID2)).toHaveLength(1);
  });

  it('latestMirror returns null for a user with no mirrors', () => {
    expect(Lookmax.latestMirror('no-such-user')).toBeNull();
  });
});

// ── PROTOCOL ─────────────────────────────────────────────────────────────────

describe('setProtocolDay / getProtocolToday / checkProtocolItem / lockProtocolToday — JSON path', () => {
  const PID = 'user-proto-001';
  const ITEMS = [
    { itemId: 'p1', title: 'Wash', checked: false },
    { itemId: 'p2', title: 'Sunscreen', checked: false },
  ];

  it('setProtocolDay creates a protocol for today', () => {
    const day = Lookmax.setProtocolDay(PID, { items: ITEMS, doNots: ['dn1'] });
    expect(day.items).toHaveLength(2);
    expect(day.isLocked).toBe(false);
    expect(day.doNots).toContain('dn1');
  });

  it('getProtocolToday returns the protocol', () => {
    const day = Lookmax.getProtocolToday(PID);
    expect(day).not.toBeNull();
    expect(day.items).toHaveLength(2);
  });

  it('setProtocolDay upserts — re-calling for the same date replaces', () => {
    Lookmax.setProtocolDay(PID, { items: [{ itemId: 'p1', title: 'Updated', checked: false }], doNots: [] });
    const day = Lookmax.getProtocolToday(PID);
    expect(day.items).toHaveLength(1);
    expect(day.items[0].title).toBe('Updated');
  });

  it('checkProtocolItem toggles a single item', () => {
    // Reset with two items.
    Lookmax.setProtocolDay(PID, { items: ITEMS, doNots: [] });
    const updated = Lookmax.checkProtocolItem(PID, 'p1', true);
    expect(updated).not.toBeNull();
    const item = updated.items.find((i) => i.itemId === 'p1');
    expect(item.checked).toBe(true);
    // p2 should remain unchecked.
    expect(updated.items.find((i) => i.itemId === 'p2').checked).toBe(false);
  });

  it('checkProtocolItem returns null for an unknown itemId', () => {
    expect(Lookmax.checkProtocolItem(PID, 'nonexistent', true)).toBeNull();
  });

  it('lockProtocolToday marks the protocol locked', () => {
    const locked = Lookmax.lockProtocolToday(PID);
    expect(locked.isLocked).toBe(true);
  });

  it('checkProtocolItem returns null on a locked protocol', () => {
    expect(Lookmax.checkProtocolItem(PID, 'p1', false)).toBeNull();
  });

  it('lockProtocolToday returns null for a user with no protocol today', () => {
    expect(Lookmax.lockProtocolToday('no-such-user')).toBeNull();
  });
});

// ── HAIR ─────────────────────────────────────────────────────────────────────

describe('addHair / getHair / latestHair — JSON path', () => {
  const HID = 'user-hair-001';

  it('addHair persists a record', () => {
    const rec = Lookmax.addHair(HID, {
      norwood: 'I',
      hairlineScore: 85,
      recessionMm: 2,
      confidence: 'high',
    });
    expect(rec.id).toBeTruthy();
    expect(rec.norwood).toBe('I');
    expect(rec.hairlineScore).toBe(85);
  });

  it('getHair returns all records oldest-first', () => {
    Lookmax.addHair(HID, { norwood: 'II', hairlineScore: 70, recessionMm: 6, confidence: 'medium' });
    const hair = Lookmax.getHair(HID);
    expect(hair).toHaveLength(2);
    expect(hair[0].norwood).toBe('I');
    expect(hair[1].norwood).toBe('II');
  });

  it('latestHair returns the last record', () => {
    expect(Lookmax.latestHair(HID).norwood).toBe('II');
  });

  it('latestHair returns null for a user with no hair records', () => {
    expect(Lookmax.latestHair('no-hair-user')).toBeNull();
  });
});

// ── NIGHT LOGS ───────────────────────────────────────────────────────────────

describe('addNightLog / getNightLogs / nightLogForDate / nightLogForToday — JSON path', () => {
  const NID = 'user-night-001';

  it('addNightLog persists a record', () => {
    const rec = Lookmax.addNightLog(NID, {
      sleepHours: 8,
      waterGlasses: 10,
      saltAlcoholFlag: false,
      notes: 'Good night',
    });
    expect(rec.sleepHours).toBe(8);
    expect(rec.waterGlasses).toBe(10);
    expect(rec.saltAlcoholFlag).toBe(false);
  });

  it('addNightLog upserts for the same IST date — second call replaces first', () => {
    Lookmax.addNightLog(NID, {
      sleepHours: 6,
      waterGlasses: 4,
      saltAlcoholFlag: true,
      notes: 'Replaced',
    });
    const logs = Lookmax.getNightLogs(NID);
    const today = Lookmax.istDate();
    const todayLogs = logs.filter((n) => n.date === today);
    expect(todayLogs).toHaveLength(1);
    expect(todayLogs[0].sleepHours).toBe(6);
  });

  it('nightLogForDate returns null for a date with no log', () => {
    expect(Lookmax.nightLogForDate(NID, '1999-01-01')).toBeNull();
  });

  it('nightLogForToday returns todayas log', () => {
    const log = Lookmax.nightLogForToday(NID);
    expect(log).not.toBeNull();
    expect(log.saltAlcoholFlag).toBe(true);
  });

  it('clamps sleepHours to [0,14] and waterGlasses to [0,15]', () => {
    const rec = Lookmax.addNightLog(NID, { sleepHours: 99, waterGlasses: -5 });
    expect(rec.sleepHours).toBe(14);
    expect(rec.waterGlasses).toBe(0);
  });

  it('notes are capped at 280 chars', () => {
    const long = 'x'.repeat(500);
    const rec = Lookmax.addNightLog(NID, { notes: long });
    expect(rec.notes.length).toBe(280);
  });
});

// ── OTPs ─────────────────────────────────────────────────────────────────────

describe('setOtp / verifyOtp — JSON path (OTPs stay JSON-only)', () => {
  const PHONE = '919999999999';

  it('setOtp + verifyOtp (correct code) = true, then consumed', () => {
    Lookmax.setOtp(PHONE, '123456');
    expect(Lookmax.verifyOtp(PHONE, '123456')).toBe(true);
    // Second verify: already consumed.
    expect(Lookmax.verifyOtp(PHONE, '123456')).toBe(false);
  });

  it('verifyOtp with wrong code = false', () => {
    Lookmax.setOtp(PHONE, '654321');
    expect(Lookmax.verifyOtp(PHONE, '000000')).toBe(false);
    // Code still valid after wrong attempt.
    expect(Lookmax.verifyOtp(PHONE, '654321')).toBe(true);
  });

  it('expired OTP is rejected', () => {
    Lookmax.setOtp(PHONE, '111111', 1); // 1 ms TTL
    return new Promise((resolve) =>
      setTimeout(() => {
        expect(Lookmax.verifyOtp(PHONE, '111111')).toBe(false);
        resolve();
      }, 5)
    );
  });
});
