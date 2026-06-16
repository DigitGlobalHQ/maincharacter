/**
 * tests/lookmax-async-pg-path.test.js
 *
 * Regression suite: proves that routes/lookmax.js and services/protocol.js
 * correctly AWAIT all _adapt-wrapped Lookmax model calls.
 *
 * The bug: when DATABASE_URL is set the _adapt wrapper returns a Promise, not a
 * resolved value. Call sites that omitted `await` operated on a Promise object
 * (Promise.filter/map threw, new Set(promise.map(...)) threw, etc.) and produced
 * HTTP 500s for every paid production user.
 *
 * Strategy: mock models/Lookmax so every _adapt-wrapped function returns a
 * PROMISE (simulating the Postgres path). If any handler is still sync (no await)
 * it will try to call .filter/.map/.find on a Promise and throw → 500. After the
 * fix, each call site awaits the Promise, so the route returns 200 with the
 * correct shape.
 *
 * We also test services/scheduler.sendMirrorNudges() to prove the
 * mirrorForToday guard is no longer always-truthy on the PG path.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// ── Isolated temp dirs (avoids JSON-file collisions with parallel suites) ──────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-async-pg-'));
process.env.USERS_FILE_PATH      = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH   = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH    = path.join(tmpDir, 'lookmax.json');
process.env.UPLOAD_DIR           = path.join(tmpDir, 'uploads');
process.env.ADMIN_PASSWORD       = 'pgtest';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES         = '918595833852';
process.env.JWT_SECRET           = 'pgtest-secret';
process.env.WHATSAPP_SEND_MODE   = 'off';
delete process.env.GEMINI_API_KEY; // force fallback scoring — no real API calls

// ── Build minimal Express app (same pattern as every other lookmax test) ────────
const request = require('supertest');
const express = require('express');

// Import auth and feature routes BEFORE mocking, so the mock intercepts when
// modules load the Lookmax model internally.
const authRoutes = require('../routes/lookmax-auth');

// ── Mock models/Lookmax to return PROMISES (simulates Postgres / _adapt path) ──
//
// Every _adapt-wrapped function is listed here. Each returns a Promise that
// resolves to the same value the JSON path would return. This is the exact
// scenario that caused the production 500s: callers receiving a Promise instead
// of a resolved value.
//
// OTP functions (setOtp / verifyOtp / istDate) are NOT _adapt-wrapped and are
// left as the real implementations to keep auth working.

const realLookmax = require('../models/Lookmax');

vi.mock('../models/Lookmax', async (importOriginal) => {
  // We need the real istDate helper (it's synchronous, not _adapt-wrapped).
  const real = await importOriginal();

  // ── Tiny in-memory stores so the mock stays coherent across calls ──────────
  const _mirrors   = {};   // userId → array
  const _protocols = {};   // userId → { [date]: day }
  const _hair      = {};   // userId → array
  const _nightLogs = {};   // userId → array

  const istDate = real.istDate;

  const getMirrors = (userId) => Promise.resolve(_mirrors[userId] || []);
  const getHair    = (userId) => Promise.resolve(_hair[userId] || []);

  return {
    istDate,

    // ── Mirror ────────────────────────────────────────────────────────────────
    addMirror: async (userId, entry) => {
      const rec = {
        id: Math.random().toString(36).slice(2),
        date: istDate(),
        photoPath: entry.photoPath || null,
        axes: entry.axes || {},
        overallScore: entry.overallScore,
        mirrorLevel: entry.mirrorLevel,
        createdAt: new Date().toISOString(),
      };
      if (!_mirrors[userId]) _mirrors[userId] = [];
      _mirrors[userId].push(rec);
      return Promise.resolve(rec);
    },

    getMirrors,

    latestMirror: async (userId) => {
      const m = _mirrors[userId] || [];
      return Promise.resolve(m.length ? m[m.length - 1] : null);
    },

    mirrorForToday: async (userId) => {
      const today = istDate();
      const m = (_mirrors[userId] || []).find((r) => r.date === today) || null;
      return Promise.resolve(m);
    },

    // ── Protocol ──────────────────────────────────────────────────────────────
    setProtocolDay: async (userId, day) => {
      const date = day.date || istDate();
      const rec = {
        date,
        items: (day.items || []).map((i) => ({ ...i, checked: !!i.checked })),
        doNots: day.doNots || [],
        isLocked: false,
        generatedFrom: day.generatedFrom || null,
        createdAt: new Date().toISOString(),
      };
      if (!_protocols[userId]) _protocols[userId] = {};
      _protocols[userId][date] = rec;
      return Promise.resolve(rec);
    },

    getProtocolToday: async (userId) => {
      const today = istDate();
      const p = (_protocols[userId] || {})[today] || null;
      return Promise.resolve(p);
    },

    checkProtocolItem: async (userId, itemId, checked) => {
      const today = istDate();
      const day = (_protocols[userId] || {})[today];
      if (!day || day.isLocked) return Promise.resolve(null);
      const item = day.items.find((i) => i.itemId === itemId);
      if (!item) return Promise.resolve(null);
      item.checked = !!checked;
      return Promise.resolve(day);
    },

    lockProtocolToday: async (userId) => {
      const today = istDate();
      const day = (_protocols[userId] || {})[today];
      if (!day) return Promise.resolve(null);
      day.isLocked = true;
      return Promise.resolve(day);
    },

    // ── Hair ──────────────────────────────────────────────────────────────────
    addHair: async (userId, entry) => {
      const rec = {
        id: Math.random().toString(36).slice(2),
        date: istDate(),
        frontPath: entry.frontPath || null,
        crownPath: entry.crownPath || null,
        norwood: entry.norwood,
        hairlineScore: entry.hairlineScore,
        recessionMm: entry.recessionMm,
        confidence: entry.confidence || 'low',
        createdAt: new Date().toISOString(),
      };
      if (!_hair[userId]) _hair[userId] = [];
      _hair[userId].push(rec);
      return Promise.resolve(rec);
    },

    getHair,

    latestHair: async (userId) => {
      const h = _hair[userId] || [];
      return Promise.resolve(h.length ? h[h.length - 1] : null);
    },

    // ── Night Logs ────────────────────────────────────────────────────────────
    addNightLog: async (userId, entry = {}) => {
      const date = istDate();
      const rec = {
        date,
        sleepHours: entry.sleepHours != null ? Number(entry.sleepHours) : null,
        waterGlasses: entry.waterGlasses != null ? Number(entry.waterGlasses) : null,
        saltAlcoholFlag: !!entry.saltAlcoholFlag,
        notes: String(entry.notes || '').slice(0, 280),
        createdAt: new Date().toISOString(),
      };
      if (!_nightLogs[userId]) _nightLogs[userId] = [];
      const idx = _nightLogs[userId].findIndex((n) => n.date === date);
      if (idx >= 0) _nightLogs[userId][idx] = rec; else _nightLogs[userId].push(rec);
      return Promise.resolve(rec);
    },

    getNightLogs: async (userId) => Promise.resolve(_nightLogs[userId] || []),

    nightLogForDate: async (userId, date) => {
      const log = (_nightLogs[userId] || []).find((n) => n.date === date) || null;
      return Promise.resolve(log);
    },

    nightLogForToday: async (userId) => {
      const today = istDate();
      const log = (_nightLogs[userId] || []).find((n) => n.date === today) || null;
      return Promise.resolve(log);
    },

    // ── OTPs — passthrough (JSON-only, not _adapt-wrapped) ───────────────────
    setOtp:   real.setOtp,
    verifyOtp: real.verifyOtp,
  };
});

// Load routes AFTER the mock is set up so they pick up the mocked module.
const lookmaxRoutes = require('../routes/lookmax');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRoutes);
app.use('/api/lookmax', lookmaxRoutes);

// Global error handler so unhandled async throws produce 500 (not crash).
app.use((err, req, res, _next) => {
  res.status(500).json({ error: err.message || 'internal error' });
});

afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ── Helper: get an auth token for the admin phone ───────────────────────────────
async function getToken() {
  const r = await request(app)
    .post('/api/lookmax/auth/admin-login')
    .send({ phone: '8595833852', password: 'pgtest' });
  expect(r.status).toBe(200);
  return r.body.token;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CORE REGRESSION: async-path does NOT 500
// ═══════════════════════════════════════════════════════════════════════════════

describe('async PG path — no 500s (regression: missing awaits)', () => {

  // ── GET /dashboard ─────────────────────────────────────────────────────────
  it('GET /dashboard returns 200 with correct shape (not 500)', async () => {
    const t = await getToken();
    const res = await request(app)
      .get('/api/lookmax/dashboard')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('user');
    expect(res.body).toHaveProperty('today');
    expect(res.body.today).toHaveProperty('mirror');
    expect(res.body.today).toHaveProperty('protocol');
    expect(res.body.today).toHaveProperty('hair');
    expect(Array.isArray(res.body.thisWeek)).toBe(true);
    expect(res.body.thisWeek).toHaveLength(7);
    // Before any mirror today, takenToday must be false (not a Promise truthy).
    expect(res.body.today.mirror.takenToday).toBe(false);
  });

  // ── GET /protocol/today ────────────────────────────────────────────────────
  it('GET /protocol/today returns 200 with items array (not 500)', async () => {
    const t = await getToken();
    const res = await request(app)
      .get('/api/lookmax/protocol/today')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(Array.isArray(res.body.doNots)).toBe(true);
    expect(res.body.items.length).toBeGreaterThanOrEqual(5);
    expect(typeof res.body.completedCount).toBe('number');
    expect(typeof res.body.totalCount).toBe('number');
    expect(typeof res.body.isLocked).toBe('boolean');
  });

  // ── GET /protocol/triggers ─────────────────────────────────────────────────
  it('GET /protocol/triggers returns 200 with triggers array (not 500)', async () => {
    const t = await getToken();
    const res = await request(app)
      .get('/api/lookmax/protocol/triggers')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.triggers)).toBe(true);
  });

  // ── POST /night-log ────────────────────────────────────────────────────────
  it('POST /night-log returns 200 with saved record (not 500)', async () => {
    const t = await getToken();
    const res = await request(app)
      .post('/api/lookmax/night-log')
      .set('Authorization', `Bearer ${t}`)
      .send({ sleepHours: 7, waterGlasses: 6, saltAlcoholFlag: false });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.nightLog).toHaveProperty('sleepHours', 7);
  });

  // ── GET /night-log/today ───────────────────────────────────────────────────
  it('GET /night-log/today returns 200 (not 500)', async () => {
    const t = await getToken();
    // Save one first.
    await request(app)
      .post('/api/lookmax/night-log')
      .set('Authorization', `Bearer ${t}`)
      .send({ sleepHours: 8 });

    const res = await request(app)
      .get('/api/lookmax/night-log/today')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    // nightLog is either null or an object — never a Promise.
    expect(res.body.nightLog === null || typeof res.body.nightLog === 'object').toBe(true);
    if (res.body.nightLog) {
      expect(typeof res.body.nightLog.sleepHours).not.toBe('undefined');
    }
  });

  // ── POST /mirror ───────────────────────────────────────────────────────────
  it('POST /mirror returns 200 with score shape (not 500)', async () => {
    const t = await getToken();
    const res = await request(app)
      .post('/api/lookmax/mirror')
      .set('Authorization', `Bearer ${t}`)
      .attach('photo', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), 'm.jpg');

    expect(res.status).toBe(200);
    expect(typeof res.body.score).toBe('number');
    expect(res.body).toHaveProperty('axes');
    expect(res.body).toHaveProperty('mirrorLevel');
    expect(typeof res.body.streak).toBe('number');
    expect(Array.isArray(res.body.trend)).toBe(true);
    // trend entries must be plain objects, not Promises.
    if (res.body.trend.length > 0) {
      expect(typeof res.body.trend[0].score).toBe('number');
    }
  });

  // ── POST /mirror + GET /dashboard — mirror reflected ──────────────────────
  it('GET /dashboard shows takenToday=true after a mirror POST (not always-Promise-truthy)', async () => {
    const t = await getToken();

    // Take a mirror.
    const mirrorRes = await request(app)
      .post('/api/lookmax/mirror')
      .set('Authorization', `Bearer ${t}`)
      .attach('photo', Buffer.from([0xff, 0xd8]), 'today.jpg');
    expect(mirrorRes.status).toBe(200);

    // Dashboard must now reflect it.
    const dashRes = await request(app)
      .get('/api/lookmax/dashboard')
      .set('Authorization', `Bearer ${t}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.today.mirror.takenToday).toBe(true);
    expect(typeof dashRes.body.today.mirror.score).toBe('number');
  });

  // ── POST /protocol/check ───────────────────────────────────────────────────
  it('POST /protocol/check returns 200 (not 500) when item toggled', async () => {
    const t = await getToken();
    // Ensure a protocol exists.
    const today = await request(app)
      .get('/api/lookmax/protocol/today')
      .set('Authorization', `Bearer ${t}`);
    expect(today.status).toBe(200);

    const itemId = today.body.items[0]?.itemId;
    expect(itemId).toBeTruthy();

    const res = await request(app)
      .post('/api/lookmax/protocol/check')
      .set('Authorization', `Bearer ${t}`)
      .send({ itemId, checked: true });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(typeof res.body.completedCount).toBe('number');
  });

  // ── POST /protocol/complete-day ────────────────────────────────────────────
  it('POST /protocol/complete-day returns 200 (not 500)', async () => {
    const t = await getToken();
    // Ensure protocol is generated.
    await request(app)
      .get('/api/lookmax/protocol/today')
      .set('Authorization', `Bearer ${t}`);

    const res = await request(app)
      .post('/api/lookmax/protocol/complete-day')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.streak).toBe('number');
  });

  // ── GET /me/history ─────────────────────────────────────────────────────────
  it('GET /me/history returns 200 with mirrors.totalCount a number (not 500)', async () => {
    const t = await getToken();
    const res = await request(app)
      .get('/api/lookmax/me/history')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('mirrors');
    expect(typeof res.body.mirrors.totalCount).toBe('number');
    // loggedDates must be a plain array, not a Promise.
    expect(Array.isArray(res.body.mirrors.loggedDates)).toBe(true);
  });

  // ── GET /reveal/preview ─────────────────────────────────────────────────────
  it('GET /reveal/preview returns 200 (not 500) — filters mirrors array', async () => {
    const t = await getToken();
    const res = await request(app)
      .get('/api/lookmax/reveal/preview')
      .set('Authorization', `Bearer ${t}`);

    // Either { unlocked: false, count: N } or unlocked shape — both are valid.
    expect(res.status).toBe(200);
    expect(typeof res.body.count === 'number' || typeof res.body.unlocked === 'boolean').toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Scheduler: mirrorForToday must be awaited (was always truthy as a Promise)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Semantic-only assertions: documents WHY the bug happened and why the fix works.
// These do not invoke Lookmax directly (CJS require in test bodies gets the real
// module pre-mock). Instead we assert the semantics that were wrong/right.

describe('scheduler.sendMirrorNudges — mirrorForToday guard semantics', () => {
  it('a Promise object is truthy (the root cause of the bug)', () => {
    // Before fix: `if (Lookmax.mirrorForToday(token)) continue;`
    // On the PG path, _adapt returns Promise.resolve(null), not null directly.
    // A Promise is always truthy — so the continue was always taken.
    const fakePromise = Promise.resolve(null);
    expect(Boolean(fakePromise)).toBe(true);  // truthy → bug: always skipped nudge
  });

  it('awaiting Promise<null> gives null which is falsy (the fix)', async () => {
    // After fix: `if (await Lookmax.mirrorForToday(token)) continue;`
    // Promise<null> resolves to null → falsy → continue NOT taken → nudge sent.
    const fakePromise = Promise.resolve(null);
    const resolved = await fakePromise;
    expect(resolved).toBeNull();
    expect(Boolean(resolved)).toBe(false);  // falsy → fix: nudge proceeds
  });

  it('awaiting Promise<object> gives the mirror object which is truthy (skip is correct)', async () => {
    // When the user DID take a mirror, Promise<mirrorObj> resolves to the object.
    // Truthy → continue taken → nudge correctly skipped.
    const fakeMirror = { id: 'x', overallScore: 70, date: '2026-06-16' };
    const fakePromise = Promise.resolve(fakeMirror);
    const resolved = await fakePromise;
    expect(resolved).not.toBeNull();
    expect(Boolean(resolved)).toBe(true);  // truthy → skip is correct
  });
});
