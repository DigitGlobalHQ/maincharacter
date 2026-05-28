/**
 * tests/reaudit-result.test.js
 *
 * - Delta computation accuracy
 * - Signed URL generation (mocked — R2 not configured in tests)
 * - Raw R2 keys must never appear in the response payload
 * - mirrorLevel computation from Day-30 scores
 * - consultantVariant assignment (UP / FLAT / DOWN)
 * - heldCount branching in the DOWN variant
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-reaudit-result-'));
process.env.USERS_FILE_PATH          = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH       = path.join(tmpDir, 'waitlist.json');
process.env.AUDIT_SESSIONS_FILE_PATH = path.join(tmpDir, 'audit-sessions.json');
process.env.LOOKMAX_FILE_PATH        = path.join(tmpDir, 'lookmax.json');
process.env.ADMIN_PASSWORD           = 'resultpass';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES             = '918595000100';
process.env.JWT_SECRET               = 'result-test-secret';
process.env.WHATSAPP_SEND_MODE       = 'off';
delete process.env.GEMINI_API_KEY;
delete process.env.DATABASE_URL;
// R2 NOT configured — no env vars set, so signed URLs return null
delete process.env.R2_ACCOUNT_ID;
delete process.env.R2_ACCESS_KEY_ID;
delete process.env.R2_SECRET_ACCESS_KEY;
delete process.env.R2_BUCKET;

const request  = require('supertest');
const express  = require('express');
const User     = require('../models/User');

const lookmaxRoutes = require('../routes/lookmax');
const authRoutes    = require('../routes/lookmax-auth');
const reauditRoutes = require('../routes/reaudit');

// ── Pure function import ─────────────────────────────────────────
const {
  computeDeltas,
  computeOverall,
  mirrorLevelFor,
  selectConsultantVariant,
} = require('../routes/reaudit');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRoutes);
app.use('/api/lookmax', lookmaxRoutes);
app.use('/api/lookmax', reauditRoutes);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

async function adminToken() {
  const r = await request(app)
    .post('/api/lookmax/auth/admin-login')
    .send({ phone: '8595000100', password: 'resultpass' });
  return r.body.token;
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

const AXES = ['skinClarity','jawDefinition','eyeArea','hairDensity',
              'posture','facialHarmony','expression','bodyComposition'];

const BASELINE_SCORES = {
  skinClarity: 55, jawDefinition: 50, eyeArea: 60, hairDensity: 62,
  posture: 58, facialHarmony: 52, expression: 48, bodyComposition: 65,
};

const DAY30_UP_SCORES = {
  skinClarity: 65, jawDefinition: 62, eyeArea: 70, hairDensity: 72,
  posture: 68, facialHarmony: 62, expression: 60, bodyComposition: 75,
};

const DAY30_FLAT_SCORES = {
  skinClarity: 56, jawDefinition: 51, eyeArea: 61, hairDensity: 62,
  posture: 59, facialHarmony: 52, expression: 49, bodyComposition: 65,
};

const DAY30_DOWN_SCORES = {
  skinClarity: 45, jawDefinition: 40, eyeArea: 50, hairDensity: 52,
  posture: 48, facialHarmony: 42, expression: 38, bodyComposition: 55,
};

const BASELINE = (scores = BASELINE_SCORES) => ({
  scores,
  leverageAxis: 'expression',
  overall: computeOverall(scores),
  capturedAt: daysAgo(32),
  photoStorageKeys: {
    front: 'r2:audit/tok/baseline-front.jpg',
    side: 'r2:audit/tok/baseline-side.jpg',
    body: 'r2:audit/tok/baseline-body.jpg',
  },
});

function makeReAuditResult(scores) {
  const deltas = computeDeltas(BASELINE_SCORES, scores);
  const overall = computeOverall(scores);
  const baselineOverall = computeOverall(BASELINE_SCORES);
  return {
    scores,
    deltas,
    overallDelta: overall - baselineOverall,
    mirrorLevel: mirrorLevelFor(overall),
    completedAt: new Date().toISOString(),
  };
}

// ── Unit tests: pure functions ──────────────────────────────────────

describe('computeDeltas (pure function)', () => {
  it('correctly computes per-axis deltas', () => {
    const deltas = computeDeltas(BASELINE_SCORES, DAY30_UP_SCORES);
    expect(deltas.skinClarity).toBe(10);
    expect(deltas.jawDefinition).toBe(12);
    expect(deltas.expression).toBe(12);
  });

  it('returns negative deltas for DOWN results', () => {
    const deltas = computeDeltas(BASELINE_SCORES, DAY30_DOWN_SCORES);
    for (const axis of AXES) {
      expect(deltas[axis]).toBeLessThan(0);
    }
  });

  it('returns near-zero deltas for FLAT results', () => {
    const deltas = computeDeltas(BASELINE_SCORES, DAY30_FLAT_SCORES);
    for (const axis of AXES) {
      expect(Math.abs(deltas[axis])).toBeLessThanOrEqual(2);
    }
  });
});

describe('computeOverall (pure function)', () => {
  it('returns average of 8 axes, rounded', () => {
    const result = computeOverall(BASELINE_SCORES);
    const sum = Object.values(BASELINE_SCORES).reduce((a, b) => a + b, 0);
    expect(result).toBe(Math.round(sum / 8));
  });
});

describe('mirrorLevelFor (pure function)', () => {
  it('assigns raw below 40', () => expect(mirrorLevelFor(35)).toBe('raw'));
  it('assigns polished 40-59', () => expect(mirrorLevelFor(50)).toBe('polished'));
  it('assigns magnetic 60-74', () => expect(mirrorLevelFor(68)).toBe('magnetic'));
  it('assigns radiant 75-89', () => expect(mirrorLevelFor(80)).toBe('radiant'));
  it('assigns sovereign 90+', () => expect(mirrorLevelFor(92)).toBe('sovereign'));
});

describe('selectConsultantVariant (pure function)', () => {
  it('returns UP variant for positive overall delta', () => {
    const v = selectConsultantVariant(5, {});
    expect(v.variant).toBe('up');
    // UP variant is founder-deferred — no copy shipped yet
  });

  it('returns FLAT variant for near-zero delta (between -3 and +3)', () => {
    const v = selectConsultantVariant(1, {});
    expect(v.variant).toBe('flat');
    expect(v.text).toContain('◆ MainCharacter');
    expect(v.text).toContain('Thirty days is a short measurement window');
  });

  it('returns FLAT variant for delta of 0', () => {
    const v = selectConsultantVariant(0, {});
    expect(v.variant).toBe('flat');
  });

  it('returns FLAT variant for delta of -2', () => {
    const v = selectConsultantVariant(-2, {});
    expect(v.variant).toBe('flat');
  });

  it('returns DOWN variant for delta below -3', () => {
    const v = selectConsultantVariant(-10, {});
    expect(v.variant).toBe('down');
    expect(v.text).toContain('◆ MainCharacter');
    expect(v.text).toContain('Day 30 reads below Day 1');
  });

  it('DOWN variant with held>=1 includes the "axes that held" sentence', () => {
    // heldCount computed from deltas: axes with delta30 > -2
    const deltas = { skinClarity: 5, jawDefinition: -8, eyeArea: -9, hairDensity: -10,
                     posture: -11, facialHarmony: -12, expression: -13, bodyComposition: -14 };
    const v = selectConsultantVariant(-10, deltas);
    expect(v.variant).toBe('down');
    expect(v.text).toContain('The axes that held tell us the protocol held');
  });

  it('DOWN variant with heldCount=0 drops the "axes that held" sentence', () => {
    // All axes down by more than -2
    const deltas = { skinClarity: -5, jawDefinition: -8, eyeArea: -9, hairDensity: -10,
                     posture: -11, facialHarmony: -12, expression: -13, bodyComposition: -14 };
    const v = selectConsultantVariant(-10, deltas);
    expect(v.variant).toBe('down');
    expect(v.text).not.toContain('The axes that held tell us the protocol held');
    // Still ends with the signature
    expect(v.text).toContain('◆ MainCharacter');
    // Should contain "The axes that fell" sentence
    expect(v.text).toContain('The axes that fell');
  });

  it('DOWN variant always ends with ◆ MainCharacter', () => {
    const deltas = { skinClarity: -5, jawDefinition: -8, eyeArea: -9, hairDensity: -10,
                     posture: -11, facialHarmony: -12, expression: -13, bodyComposition: -14 };
    const v = selectConsultantVariant(-10, deltas);
    expect(v.text.trimEnd().endsWith('◆ MainCharacter')).toBe(true);
  });

  it('FLAT variant ends with ◆ MainCharacter', () => {
    const v = selectConsultantVariant(0, {});
    expect(v.text.trimEnd().endsWith('◆ MainCharacter')).toBe(true);
  });
});

// ── API tests ────────────────────────────────────────────────────────
// NOTE: adminToken() creates the user lazily via admin-login.
// updateUser must always be called AFTER adminToken() for the user to exist.

const ADMIN_PHONE_RESULT = '918595000100';

describe('GET /api/lookmax/reaudit/result', () => {
  it('401s without auth', async () => {
    const res = await request(app).get('/api/lookmax/reaudit/result');
    expect(res.status).toBe(401);
  });

  it('404 when no reAuditResult on user', async () => {
    const t = await adminToken();
    // Ensure no reAuditResult
    User.updateUser(ADMIN_PHONE_RESULT, { reAuditResult: null, reAuditCompletedThisCycle: false });
    const res = await request(app)
      .get('/api/lookmax/reaudit/result')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(404);
  });

  it('returns result with correct shape when reAuditResult exists', async () => {
    const t = await adminToken();
    const reAuditResult = makeReAuditResult(DAY30_UP_SCORES);
    User.updateUser(ADMIN_PHONE_RESULT, {
      lookmaxxingActive: true,
      lookmaxxingStartedAt: daysAgo(32),
      lookmaxBaseline: BASELINE(),
      reAuditCompletedThisCycle: true,
      reAuditResult,
    });

    const res = await request(app)
      .get('/api/lookmax/reaudit/result')
      .set('Authorization', `Bearer ${t}`);

    expect(res.status).toBe(200);
    const body = res.body;

    // Shape
    expect(body).toHaveProperty('baselineOverall');
    expect(body).toHaveProperty('day30Overall');
    expect(body).toHaveProperty('overallDelta');
    expect(body).toHaveProperty('axisDeltas');
    expect(body).toHaveProperty('baselineAxisScores');
    expect(body).toHaveProperty('day30AxisScores');
    expect(body).toHaveProperty('mirrorLevel');
    expect(body).toHaveProperty('deltaSign');
    expect(body).toHaveProperty('consultantLine');
    expect(body).toHaveProperty('variant');
    // Photo URLs (null when R2 not configured)
    expect(body).toHaveProperty('baselinePhotoUrl');
    expect(body).toHaveProperty('day30PhotoUrl');
    // heldCount always numeric
    expect(typeof body.heldCount).toBe('number');
  });

  it('raw R2 keys never appear in the response body', async () => {
    const t = await adminToken();
    const reAuditResult = makeReAuditResult(DAY30_UP_SCORES);
    User.updateUser(ADMIN_PHONE_RESULT, {
      lookmaxxingActive: true,
      lookmaxBaseline: {
        ...BASELINE(),
        photoStorageKeys: {
          front: 'r2:audit/tok/baseline-front.jpg',
          side:  'r2:audit/tok/baseline-side.jpg',
        },
      },
      reAuditCompletedThisCycle: true,
      reAuditResult,
    });

    const res = await request(app)
      .get('/api/lookmax/reaudit/result')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);

    const bodyStr = JSON.stringify(res.body);
    // DPDPA guard: no raw R2 key string appears in any form in the response
    expect(bodyStr).not.toContain('r2:audit/tok/baseline-front.jpg');
    expect(bodyStr).not.toContain('r2:audit/tok/baseline-side.jpg');
    // storageKey must not be present at all
    expect(bodyStr).not.toContain('storageKey');
    expect(bodyStr).not.toContain('photoStorageKeys');
  });

  it('deltaSign is "up" for positive delta, "flat" for near-zero, "down" for negative', async () => {
    const t = await adminToken();

    // UP case
    User.updateUser(ADMIN_PHONE_RESULT, {
      lookmaxBaseline: BASELINE(),
      reAuditResult: makeReAuditResult(DAY30_UP_SCORES),
      reAuditCompletedThisCycle: true,
    });
    let res = await request(app).get('/api/lookmax/reaudit/result').set('Authorization', `Bearer ${t}`);
    expect(res.body.deltaSign).toBe('up');

    // FLAT case
    User.updateUser(ADMIN_PHONE_RESULT, { reAuditResult: makeReAuditResult(DAY30_FLAT_SCORES) });
    res = await request(app).get('/api/lookmax/reaudit/result').set('Authorization', `Bearer ${t}`);
    expect(res.body.deltaSign).toBe('flat');

    // DOWN case
    User.updateUser(ADMIN_PHONE_RESULT, { reAuditResult: makeReAuditResult(DAY30_DOWN_SCORES) });
    res = await request(app).get('/api/lookmax/reaudit/result').set('Authorization', `Bearer ${t}`);
    expect(res.body.deltaSign).toBe('down');
  });
});
