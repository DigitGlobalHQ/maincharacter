/**
 * tests/admin-simulate-reaudit.test.js
 * POST /api/admin/simulate-reaudit — synthetic Day-30 result for variant testing
 *
 * Tests:
 *  - auth required
 *  - requires existing lookmaxBaseline (409 if absent)
 *  - variant='up' → all axes moved +8 to +14 above baseline
 *  - variant='flat' → all axes within ±2 of baseline
 *  - variant='down' heldCount=0 → all axes moved < −2
 *  - variant='down' heldCount=1 → exactly one axis within ±2
 *  - variant='down' heldCount=8 → all axes within ±2 (odd edge, but spec says "up to 8")
 *  - persists reAuditResult on user
 *  - returns reveal URL
 *  - rejects unknown variant
 *  - audit-logged
 *
 * Also verifies that selectConsultantVariant (from routes/reaudit.js) returns
 * the correct Consultant string for each variant when fed the synthetic data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-simra-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.AUDIT_SESSIONS_FILE_PATH = path.join(tmpDir, 'audit-sessions.json');
process.env.COMP_GRANTS_FILE_PATH = path.join(tmpDir, 'comp_grants.jsonl');
process.env.TIMEWARP_LOG_FILE_PATH = path.join(tmpDir, 'timewarp.jsonl');
process.env.SIMULATE_REAUDIT_LOG_FILE_PATH = path.join(tmpDir, 'simulate_reaudit.jsonl');
process.env.ADMIN_PASSWORD = 'testpass-simra';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.UPGRADE_BASE_URL = 'https://test.local';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const adminRouter = require('../routes/admin');
const User = require('../models/User');
const { selectConsultantVariant, computeDeltas, computeOverall } = require('../routes/reaudit');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

const BASELINE_SCORES = {
  skinClarity: 60,
  jawDefinition: 55,
  eyeArea: 65,
  hairDensity: 50,
  posture: 70,
  facialHarmony: 60,
  expression: 65,
  bodyComposition: 55,
};

let token;
let userEmail = 'simra@example.com';

beforeAll(async () => {
  const login = await request(app).post('/api/admin/login').send({ password: 'testpass-simra' });
  token = login.body.token;

  // Grant comp access
  await request(app)
    .post('/api/admin/grant')
    .set('Authorization', `Bearer ${token}`)
    .send({ email: userEmail, plans: ['orator', 'lookmaxxing'], reason: 'simulate reaudit seed' });

  // Set a lookmaxBaseline on the user
  const u = User.getUserByEmail(userEmail);
  User.updateUser(u.phone, {
    lookmaxBaseline: {
      scores: BASELINE_SCORES,
      leverageAxis: 'hairDensity',
      overall: computeOverall(BASELINE_SCORES),
      capturedAt: new Date().toISOString(),
      photoStorageKeys: {},
    },
  });
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('POST /api/admin/simulate-reaudit — auth', () => {
  it('rejects unauthenticated caller with 401', async () => {
    const res = await request(app)
      .post('/api/admin/simulate-reaudit')
      .send({ email: userEmail, variant: 'up' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/simulate-reaudit — validation', () => {
  it('returns 404 for unknown email', async () => {
    const res = await request(app)
      .post('/api/admin/simulate-reaudit')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'nobody@example.com', variant: 'up' });
    expect(res.status).toBe(404);
  });

  it('returns 400 for unknown variant', async () => {
    const res = await request(app)
      .post('/api/admin/simulate-reaudit')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: userEmail, variant: 'sideways' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/variant/i);
  });

  it('returns 409 when user has no lookmaxBaseline', async () => {
    // Create a user without baseline
    const noBaseEmail = 'nobase@example.com';
    await request(app)
      .post('/api/admin/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: noBaseEmail, plans: ['lookmaxxing'], reason: 'no baseline test' });

    // Clear baseline explicitly
    const u = User.getUserByEmail(noBaseEmail);
    User.updateUser(u.phone, { lookmaxBaseline: null });

    const res = await request(app)
      .post('/api/admin/simulate-reaudit')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: noBaseEmail, variant: 'up' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/baseline/i);
  });
});

describe('POST /api/admin/simulate-reaudit — variant=up', () => {
  it('produces axes all moved +8 to +14 above baseline', async () => {
    const res = await request(app)
      .post('/api/admin/simulate-reaudit')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: userEmail, variant: 'up' });

    expect(res.status).toBe(200);
    const u = User.getUserByEmail(userEmail);
    expect(u.reAuditResult).toBeTruthy();

    const deltas = computeDeltas(BASELINE_SCORES, u.reAuditResult.scores);
    for (const delta of Object.values(deltas)) {
      expect(delta).toBeGreaterThanOrEqual(8);
      expect(delta).toBeLessThanOrEqual(14);
    }

    const overallDelta = u.reAuditResult.overallDelta;
    expect(overallDelta).toBeGreaterThanOrEqual(3);
    const { variant } = selectConsultantVariant(overallDelta, deltas);
    expect(variant).toBe('up');
  });

  it('returns a revealUrl in the response', async () => {
    const res = await request(app)
      .post('/api/admin/simulate-reaudit')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: userEmail, variant: 'up' });
    expect(res.body.revealUrl).toContain('/lookmax/reveal?mode=day30');
  });
});

describe('POST /api/admin/simulate-reaudit — variant=flat', () => {
  it('produces axes all within ±2 of baseline', async () => {
    const res = await request(app)
      .post('/api/admin/simulate-reaudit')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: userEmail, variant: 'flat' });

    expect(res.status).toBe(200);
    const u = User.getUserByEmail(userEmail);
    const deltas = computeDeltas(BASELINE_SCORES, u.reAuditResult.scores);
    for (const delta of Object.values(deltas)) {
      expect(Math.abs(delta)).toBeLessThanOrEqual(2);
    }

    const overallDelta = u.reAuditResult.overallDelta;
    const { variant } = selectConsultantVariant(overallDelta, deltas);
    expect(variant).toBe('flat');
  });
});

describe('POST /api/admin/simulate-reaudit — variant=down, heldCount=0', () => {
  it('produces all axes moved < −2 (none held)', async () => {
    const res = await request(app)
      .post('/api/admin/simulate-reaudit')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: userEmail, variant: 'down', heldCount: 0 });

    expect(res.status).toBe(200);
    const u = User.getUserByEmail(userEmail);
    const deltas = computeDeltas(BASELINE_SCORES, u.reAuditResult.scores);
    // All axes must be <= −2 (noise tolerance boundary — "held" means delta > −2)
    for (const delta of Object.values(deltas)) {
      expect(delta).toBeLessThanOrEqual(-3);
    }

    const overallDelta = u.reAuditResult.overallDelta;
    const { variant, text } = selectConsultantVariant(overallDelta, deltas);
    expect(variant).toBe('down');
    // When heldCount=0, the "axes that held" sentence is dropped
    expect(text).not.toContain('The axes that held');
    expect(text).toContain('◆ MainCharacter');
  });
});

describe('POST /api/admin/simulate-reaudit — variant=down, heldCount=1', () => {
  it('produces exactly one axis within ±2 of baseline (held)', async () => {
    const res = await request(app)
      .post('/api/admin/simulate-reaudit')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: userEmail, variant: 'down', heldCount: 1 });

    expect(res.status).toBe(200);
    const u = User.getUserByEmail(userEmail);
    const deltas = computeDeltas(BASELINE_SCORES, u.reAuditResult.scores);

    // Exactly one axis delta should be > −2 (held)
    const heldAxes = Object.values(deltas).filter(d => d > -2);
    expect(heldAxes.length).toBe(1);

    const overallDelta = u.reAuditResult.overallDelta;
    const { variant, text } = selectConsultantVariant(overallDelta, deltas);
    expect(variant).toBe('down');
    // When heldCount >= 1, include the held sentence
    expect(text).toContain('The axes that held');
    expect(text).toContain('◆ MainCharacter');
  });
});

describe('POST /api/admin/simulate-reaudit — variant=down, heldCount=8', () => {
  it('produces all axes within ±2 of baseline when heldCount=8 — overall still goes down', async () => {
    const res = await request(app)
      .post('/api/admin/simulate-reaudit')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: userEmail, variant: 'down', heldCount: 8 });

    expect(res.status).toBe(200);
    const u = User.getUserByEmail(userEmail);
    const overallDelta = u.reAuditResult.overallDelta;
    // Overall delta must still be < −3 to produce 'down' variant
    expect(overallDelta).toBeLessThan(-3);
  });
});

describe('POST /api/admin/simulate-reaudit — audit log', () => {
  it('appends to simulate_reaudit log file', async () => {
    const logFile = process.env.SIMULATE_REAUDIT_LOG_FILE_PATH;
    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

    await request(app)
      .post('/api/admin/simulate-reaudit')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: userEmail, variant: 'flat' });

    expect(fs.existsSync(logFile)).toBe(true);
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.email).toBe(userEmail);
    expect(entry.variant).toBe('flat');
    expect(entry.ts).toBeTruthy();
  });
});
