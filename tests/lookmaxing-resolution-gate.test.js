/**
 * tests/lookmaxing-resolution-gate.test.js
 * Verifies the free/premium resolution gate:
 * - paid=false: strips decomposition, biggestLever, quests, styleAndColour, starterPlan
 * - paid=true:  returns all blocks
 * Cited spec: briefs/stage-1-audit-spec.md §5.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lmx-gate-'));
process.env.AUDIT_V2_STORE_PATH = path.join(tmpDir, 'audit-v2.json');
process.env.EVENTS_BACKEND = 'file';
process.env.EVENTS_JSONL_PATH = path.join(tmpDir, 'events.jsonl');

const request = (await import('supertest')).default;
const express = (await import('express')).default;

// Full sample Gemini report matching the spec §6 schema
const SAMPLE_REPORT = {
  auraScore: 62,
  rank: 'ascendant',
  firstImpression: 'The structure reads as solid. The grooming has room to move.',
  faceShape: 'oval',
  freeSignals: [
    { label: 'Tired', axis: 'underEye' },
    { label: 'Oily', axis: 'skinHydration' },
    { label: 'Sharp', axis: 'jawDefinition' },
    { label: 'Bright', axis: 'sclera' },
  ],
  decomposition: {
    skin: [{ metric: 'skinClarity', score: 58, cause: 'Mild congestion.', fix: 'Gentle cleanse.' }],
    hair: [{ metric: 'haircutFaceShapeMatch', score: 55, cause: 'Generic cut.', fix: 'Book shaped cut.' }],
    jawAndFace: [{ metric: 'jawlinePuffiness', score: 60, cause: 'Mild puffiness.', fix: 'Reduce sodium.' }],
    bodyAndPosture: [{ metric: 'postureCarriage', score: 65, cause: 'Slight forward head.', fix: 'Chin tuck.' }],
    lifestyleSignals: [{ metric: 'sclera', score: 70, cause: 'Moderate brightness.', fix: 'Sleep.' }],
  },
  biggestLever: { metric: 'underEyePuffiness', score: 38, rationale: 'Morning puffiness compresses the eye area.' },
  quests: [{ metric: 'underEyePuffiness', task: 'Cold spoon 30 seconds.', library: 'puffinessUnderEye' }],
  styleAndColour: { haircut: 'Drop fade.', palette: ['navy', 'slate'], avoid: ['neon'] },
  starterPlan: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, morning: 'AM task', evening: 'PM task' })),
  context: { boneStructure: 'Oval base.', hairDensity: 'Medium density.' },
  warnings: [],
};

const PREMIUM_FIELDS = ['decomposition', 'biggestLever', 'quests', 'styleAndColour', 'starterPlan'];
const FREE_FIELDS = ['auraScore', 'rank', 'firstImpression', 'faceShape', 'freeSignals'];

let app;

beforeAll(async () => {
  const lookmaxingRouter = (await import('../routes/lookmaxing.js')).default;
  app = express();
  app.use(express.json());
  app.use('/api/lookmaxing', lookmaxingRouter);
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('Resolution gate — GET /api/lookmaxing/audit/:id', () => {
  let guestCookie;
  let auditId;

  beforeAll(async () => {
    const guestRes = await request(app).post('/api/lookmaxing/guest');
    guestCookie = guestRes.headers['set-cookie']?.[0] || '';
    // Create an audit with quiz answers and a report pre-seeded
    const quizRes = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Cookie', guestCookie)
      .send({
        answers: [
          { questionId: 'q1', choice: 'A', label: 'Powerful.' },
          { questionId: 'q2', choice: 'C', label: 'Oily.' },
          { questionId: 'q3', choice: 'A', label: 'Thick.' },
          { questionId: 'q4', choice: 'B', label: 'Six hours.' },
          { questionId: 'q5', choice: 'B', label: 'Basic routine.' },
        ],
      });
    auditId = quizRes.body.auditId;

    // Force-inject a complete report + consent=true via the internal test helper
    const { _injectReportForTest } = await import('../routes/lookmaxing.js');
    await _injectReportForTest(auditId, SAMPLE_REPORT, true);
  });

  it('free resolution (paid=false) strips all premium blocks', async () => {
    const res = await request(app)
      .get(`/api/lookmaxing/audit/${auditId}`)
      .set('Cookie', guestCookie);
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(false);

    for (const f of FREE_FIELDS) {
      expect(res.body.report).toHaveProperty(f);
    }
    for (const f of PREMIUM_FIELDS) {
      expect(res.body.report).not.toHaveProperty(f);
    }
  });

  it('paid resolution (paid=true) returns all blocks', async () => {
    // Mark as paid via test helper
    const { _setAuditPaidForTest } = await import('../routes/lookmaxing.js');
    await _setAuditPaidForTest(auditId, true);

    const res = await request(app)
      .get(`/api/lookmaxing/audit/${auditId}`)
      .set('Cookie', guestCookie);
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);

    for (const f of [...FREE_FIELDS, ...PREMIUM_FIELDS]) {
      expect(res.body.report).toHaveProperty(f);
    }
  });

  it('returns 403 when guest_id does not match', async () => {
    const otherGuest = await request(app).post('/api/lookmaxing/guest');
    const otherCookie = otherGuest.headers['set-cookie']?.[0] || '';
    const res = await request(app)
      .get(`/api/lookmaxing/audit/${auditId}`)
      .set('Cookie', otherCookie);
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown audit id', async () => {
    const res = await request(app)
      .get('/api/lookmaxing/audit/00000000-0000-0000-0000-000000000000')
      .set('Cookie', guestCookie);
    expect(res.status).toBe(404);
  });
});
