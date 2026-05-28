/**
 * tests/admin-funnel.test.js
 * B5 — GET /api/admin/funnel tests
 *
 * Tests: auth (401 without password, 200 with),
 * all 14 tile keys present in response,
 * tile computation against a seeded data/events.jsonl fixture.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-admin-funnel-'));

// Isolate all file paths
process.env.EVENTS_JSONL_PATH = path.join(tmpDir, 'events.jsonl');
process.env.EVENTS_BACKEND = 'file';
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.EARLY_ACCESS_FILE_PATH = path.join(tmpDir, 'early-access.json');
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.ADMIN_PHONE = '919958533994';
// Use plaintext password with legacy header auth (ADMIN_PASSWORD_HASH not set)
process.env.ADMIN_PASSWORD = 'test-admin-pw-funnel';
// Ensure bcrypt hash is NOT set so legacy header auth is active
delete process.env.ADMIN_PASSWORD_HASH;

const request = require('supertest');
const express = require('express');
const adminRouter = require('../routes/admin');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/admin', adminRouter);

// ──────────────────────────────────────────────────────────────────────────────
// Seed helper: write events directly to the JSONL file
async function seedEvent(name, props = {}, userToken = null, anonId = null, tsOffset = 0) {
  const events = require('../services/events');
  if (userToken) {
    await events.track(name, props, userToken);
  } else {
    await events.trackAnonymous(name, props, anonId || 'anon-seed');
  }
  await events.flush();
}

// Seed a minimal dataset before tests
beforeAll(async () => {
  // Clear the file
  fs.writeFileSync(process.env.EVENTS_JSONL_PATH, '');

  const events = require('../services/events');

  // Audit funnel
  await events.trackAnonymous('audit_started', { reAudit: false }, 'anon-1');
  await events.trackAnonymous('audit_started', { reAudit: false }, 'anon-2');
  await events.trackAnonymous('audit_result_viewed', { overallScore: 62, weakestAxis: 'hairDensity' }, 'anon-1');
  await events.trackAnonymous('paywall_viewed', { mode: 'waitlist', auditEchoShown: true }, 'anon-1');
  await events.trackAnonymous('paywall_cta_clicked', { plan: 'lookmaxxing' }, 'anon-1');

  // Payment funnel
  await events.track('payment_initiated', { planKey: 'lookmaxxing', amount: 1499 }, 'user-tok-A');
  await events.track('payment_succeeded', { planKey: 'lookmaxxing', pillars: ['lookmaxxing'], auraPlusPlus: false, amount: 1499 }, 'user-tok-A');
  await events.track('bundle_attached', { planKey: 'auraplus', attachPath: 'at_checkout' }, 'user-tok-B');
  await events.track('payment_succeeded', { planKey: 'auraplus', pillars: ['orator', 'lookmaxxing'], auraPlusPlus: true, amount: 1999 }, 'user-tok-B');

  // Lookmaxxing habit
  await events.track('lookmax_first_mirror_taken', { overallScore: 58, hoursSincePayment: 12 }, 'user-tok-A');
  await events.track('mirror_taken', { dayOfProgram: 1, streakAfter: 1, takenAtIstHour: 7 }, 'user-tok-A');
  await events.track('mirror_taken', { dayOfProgram: 2, streakAfter: 2, takenAtIstHour: 7 }, 'user-tok-A');
  await events.track('reveal_watched', { weekNumber: 1, count: 7 }, 'user-tok-A');

  // Cross-sell (must be 0)
  // cross_sell_orator_reshow intentionally NOT seeded

  await events.flush();
});

afterAll(async () => {
  const events = require('../services/events');
  await events.flush();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('GET /api/admin/funnel — authentication', () => {
  it('returns 401 without credentials', async () => {
    const res = await request(app).get('/api/admin/funnel');
    expect(res.status).toBe(401);
  });

  it('returns 200 with correct x-admin-password header', async () => {
    const res = await request(app)
      .get('/api/admin/funnel')
      .set('x-admin-password', 'test-admin-pw-funnel');
    expect(res.status).toBe(200);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('GET /api/admin/funnel — tile structure', () => {
  let data;
  beforeAll(async () => {
    const res = await request(app)
      .get('/api/admin/funnel')
      .set('x-admin-password', 'test-admin-pw-funnel');
    data = res.body;
  });

  const EXPECTED_TILE_KEYS = [
    'auditsBegun24h',
    'auditToAction',
    'echoOnPaywall',
    'paywallToPayment',
    'conversionsYesterday',
    'arpu30d',
    'bundleAttachRate',
    'firstMirrorWithin24h',
    'day7StillMirroring',
    'day30StillMirroring',
    'mirrorsTakenYesterday',
    'revealPullThrough',
    'reauditCompletionRate',
    'crossSellSilence',
  ];

  it('contains all 14 expected tile keys', () => {
    for (const key of EXPECTED_TILE_KEYS) {
      expect(data, `missing tile: ${key}`).toHaveProperty(key);
    }
  });

  it('each tile has a value field', () => {
    for (const key of EXPECTED_TILE_KEYS) {
      expect(data[key], `tile ${key} missing value`).toHaveProperty('value');
    }
  });

  it('each tile has a state field (green|amber|red)', () => {
    const validStates = ['green', 'amber', 'red'];
    for (const key of EXPECTED_TILE_KEYS) {
      expect(validStates, `tile ${key} has invalid state: ${data[key].state}`)
        .toContain(data[key].state);
    }
  });

  it('each tile has a computedAt timestamp', () => {
    for (const key of EXPECTED_TILE_KEYS) {
      expect(data[key]).toHaveProperty('computedAt');
      expect(typeof data[key].computedAt).toBe('string');
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('GET /api/admin/funnel — computed values against seeded data', () => {
  let data;
  beforeAll(async () => {
    const res = await request(app)
      .get('/api/admin/funnel')
      .set('x-admin-password', 'test-admin-pw-funnel');
    data = res.body;
  });

  it('auditsBegun24h reflects seeded audit_started events', () => {
    // We seeded 2 audit_started events
    expect(data.auditsBegun24h.value).toBeGreaterThanOrEqual(2);
  });

  it('crossSellSilence is 0 (no reshow events seeded)', () => {
    expect(data.crossSellSilence.value).toBe(0);
    // This is the P0 counter — must always be green when 0
    expect(data.crossSellSilence.state).toBe('green');
  });

  it('bundleAttachRate is between 0 and 1', () => {
    const v = data.bundleAttachRate.value;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('firstMirrorWithin24h is between 0 and 1', () => {
    const v = data.firstMirrorWithin24h.value;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('conversionsYesterday is a non-negative integer', () => {
    expect(data.conversionsYesterday.value).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(data.conversionsYesterday.value)).toBe(true);
  });

  it('arpu30d is a non-negative number', () => {
    expect(data.arpu30d.value).toBeGreaterThanOrEqual(0);
  });

  it('revealPullThrough is between 0 and 1', () => {
    const v = data.revealPullThrough.value;
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });
});
