/**
 * tests/lookmax-pg.test.js
 *
 * Tests for the Postgres adapter in models/Lookmax.js.
 *
 * Structure mirrors db-pg.test.js:
 *   — When DATABASE_URL is absent the suite is skipped entirely (JSON-backend CI path).
 *   — When DATABASE_URL is present all pg_* functions are exercised against a live DB.
 *
 * Separate from the JSON-path tests (lookmax-model.test.js) so they can run
 * independently and CI without a database never touches this file's describe blocks.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)('Lookmax model — Postgres adapter (0005)', () => {
  let db, migrate, Lookmax;

  const userId = `test-user-${Date.now()}`;

  beforeAll(async () => {
    db      = require('../lib/db');
    migrate = require('../lib/migrate');
    const ready = await db.init();
    expect(ready).toBe(true);
    // Run pending migrations (idempotent — will skip already-applied ones).
    await migrate.run();
    // Force pg backend regardless of MC_DB_BACKEND.
    process.env.DATABASE_URL = process.env.DATABASE_URL; // already set
    Lookmax = require('../models/Lookmax');
  }, 30000);

  afterAll(async () => {
    if (!db || !db.isAvailable()) return;
    // Clean up test rows created by this suite.
    await db.query('DELETE FROM lookmax_records   WHERE user_id = $1', [userId]);
    await db.query('DELETE FROM lookmax_protocols WHERE user_id = $1', [userId]);
  });

  // ── schema_migrations includes version 5 after run() ─────────────

  it('schema_migrations table includes version 5', async () => {
    const { rows } = await db.query(
      'SELECT version FROM schema_migrations WHERE version = 5'
    );
    expect(rows).toHaveLength(1);
  });

  // ── lookmax_records table exists ──────────────────────────────────

  it('lookmax_records table exists and has expected columns', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'lookmax_records'
      ORDER BY column_name
    `);
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain('user_id');
    expect(cols).toContain('kind');
    expect(cols).toContain('date');
    expect(cols).toContain('payload');
    expect(cols).toContain('created_at');
  });

  it('lookmax_protocols table exists and has expected columns', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'lookmax_protocols'
      ORDER BY column_name
    `);
    const cols = rows.map((r) => r.column_name);
    expect(cols).toContain('user_id');
    expect(cols).toContain('date');
    expect(cols).toContain('payload');
  });

  // ── addMirror / getMirrors ────────────────────────────────────────

  it('addMirror persists a mirror record', async () => {
    const rec = await Lookmax.addMirror(userId, {
      axes: { skinClarity: 70, jawDefinition: 65 },
      overallScore: 68,
      mirrorLevel: 'magnetic',
    });
    expect(rec.id).toBeTruthy();
    expect(rec.overallScore).toBe(68);
    expect(rec.mirrorLevel).toBe('magnetic');
  });

  it('getMirrors returns all mirrors for a user', async () => {
    const mirrors = await Lookmax.getMirrors(userId);
    expect(Array.isArray(mirrors)).toBe(true);
    expect(mirrors.length).toBeGreaterThanOrEqual(1);
    expect(mirrors[mirrors.length - 1].overallScore).toBe(68);
  });

  it('addMirror APPENDS — multiple mirrors for the same user are all retained (regression)', async () => {
    await Lookmax.addMirror(userId, { axes: { skinClarity: 75 }, overallScore: 75, mirrorLevel: 'magnetic' });
    await Lookmax.addMirror(userId, { axes: { skinClarity: 80 }, overallScore: 80, mirrorLevel: 'radiant' });
    const mirrors = await Lookmax.getMirrors(userId);
    // At minimum the 3 we've inserted in this suite (the first test + 2 above).
    expect(mirrors.length).toBeGreaterThanOrEqual(3);
  });

  it('latestMirror returns the most recent record', async () => {
    const latest = await Lookmax.latestMirror(userId);
    expect(latest).not.toBeNull();
    expect(latest.overallScore).toBe(80);
  });

  it('mirrorForToday returns a record matching today IST date', async () => {
    const today = await Lookmax.mirrorForToday(userId);
    // All test mirrors were created today, so this must be non-null.
    expect(today).not.toBeNull();
  });

  // ── setProtocolDay / getProtocolToday ─────────────────────────────

  it('setProtocolDay persists a protocol day (upsert)', async () => {
    const saved = await Lookmax.setProtocolDay(userId, {
      items: [{ itemId: 'sku-wash', title: 'Wash', checked: false }],
      doNots: ['dnt-biotin'],
      generatedFrom: 'audit',
    });
    expect(saved.items).toHaveLength(1);
    expect(saved.isLocked).toBe(false);
  });

  it('getProtocolToday returns the upserted protocol', async () => {
    const day = await Lookmax.getProtocolToday(userId);
    expect(day).not.toBeNull();
    expect(day.items).toHaveLength(1);
    expect(day.doNots).toContain('dnt-biotin');
  });

  it('checkProtocolItem toggles an item (pg path)', async () => {
    const updated = await Lookmax.checkProtocolItem(userId, 'sku-wash', true);
    expect(updated).not.toBeNull();
    const item = updated.items.find((i) => i.itemId === 'sku-wash');
    expect(item.checked).toBe(true);
  });

  it('lockProtocolToday locks the protocol and blocks further toggles', async () => {
    const locked = await Lookmax.lockProtocolToday(userId);
    expect(locked.isLocked).toBe(true);
    // Toggling on a locked day must return null.
    const rejected = await Lookmax.checkProtocolItem(userId, 'sku-wash', false);
    expect(rejected).toBeNull();
  });

  // ── addHair / getHair ─────────────────────────────────────────────

  it('addHair persists a hair record', async () => {
    const rec = await Lookmax.addHair(userId, {
      norwood: 'II',
      hairlineScore: 72,
      recessionMm: 5,
      confidence: 'medium',
    });
    expect(rec.id).toBeTruthy();
    expect(rec.norwood).toBe('II');
    expect(rec.hairlineScore).toBe(72);
  });

  it('getHair returns all hair records oldest-first', async () => {
    await Lookmax.addHair(userId, { norwood: 'III', hairlineScore: 60, recessionMm: 10, confidence: 'high' });
    const hair = await Lookmax.getHair(userId);
    expect(Array.isArray(hair)).toBe(true);
    expect(hair.length).toBeGreaterThanOrEqual(2);
  });

  it('latestHair returns the most recent record', async () => {
    const latest = await Lookmax.latestHair(userId);
    expect(latest.norwood).toBe('III'); // last inserted
  });

  // ── addNightLog / getNightLogs / nightLogForDate ──────────────────

  it('addNightLog persists and upserts a night log', async () => {
    const rec = await Lookmax.addNightLog(userId, {
      sleepHours: 7.5,
      waterGlasses: 8,
      saltAlcoholFlag: false,
      notes: 'Slept well',
    });
    expect(rec.sleepHours).toBe(7.5);
    expect(rec.waterGlasses).toBe(8);
    expect(rec.saltAlcoholFlag).toBe(false);
  });

  it('addNightLog upserts — re-logging the same IST date replaces', async () => {
    await Lookmax.addNightLog(userId, {
      sleepHours: 6,
      waterGlasses: 5,
      saltAlcoholFlag: true,
      notes: 'Updated',
    });
    const logs = await Lookmax.getNightLogs(userId);
    // Only one log per IST date; the second call must replace the first.
    const today = Lookmax.istDate();
    const todayLogs = logs.filter((n) => n.date === today);
    expect(todayLogs).toHaveLength(1);
    expect(todayLogs[0].sleepHours).toBe(6);
  });

  it('nightLogForDate returns the log for a specific date', async () => {
    const today = Lookmax.istDate();
    const log = await Lookmax.nightLogForDate(userId, today);
    expect(log).not.toBeNull();
    expect(log.waterGlasses).toBe(5);
  });

  it('nightLogForToday returns todayas log', async () => {
    const log = await Lookmax.nightLogForToday(userId);
    expect(log).not.toBeNull();
    expect(log.saltAlcoholFlag).toBe(true);
  });

  // ── OTPs remain on JSON path (see DECISIONS.md) ──────────────────
  // No pg OTP tests — setOtp/verifyOtp are intentionally JSON-only.
});
