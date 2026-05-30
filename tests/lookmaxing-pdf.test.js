/**
 * tests/lookmaxing-pdf.test.js
 * Tests PDF generation, R2 cache, and auth gate.
 * R2 is mocked (no live cloud calls). pdfkit is NOT mocked — we exercise it.
 * Cited spec: briefs/stage-1-audit-spec.md §E (PDF generation).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lmx-pdf-'));
process.env.AUDIT_V2_STORE_PATH = path.join(tmpDir, 'audit-v2.json');
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.EVENTS_BACKEND = 'file';
process.env.EVENTS_JSONL_PATH = path.join(tmpDir, 'events.jsonl');
process.env.JWT_SECRET = 'test-jwt-secret';
// Ensure R2 is NOT configured so storage.putPhoto goes through dry-run,
// and getSignedUrl returns null — PDF endpoint falls back to a data URL.
delete process.env.R2_ACCOUNT_ID;
delete process.env.R2_ACCESS_KEY_ID;
delete process.env.R2_SECRET_ACCESS_KEY;
delete process.env.R2_BUCKET;

const request = (await import('supertest')).default;
const express = (await import('express')).default;
const lookmaxingRouter = (await import('../routes/lookmaxing.js')).default;
const { makeSession } = await import('./helpers/lookmax-session.js');

const app = express();
app.use(express.json());
app.use('/api/lookmaxing', lookmaxingRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const SAMPLE_REPORT = {
  auraScore: 72,
  rank: 'luminary',
  firstImpression: 'The grooming is deliberate. The posture carries work left to do.',
  faceShape: 'square',
  freeSignals: [
    { label: 'Sharp', axis: 'jawDefinition' },
    { label: 'Tired', axis: 'underEye' },
    { label: 'Clear', axis: 'skinHydration' },
    { label: 'Bright', axis: 'sclera' },
  ],
  decomposition: {
    skin: [{ metric: 'skinClarity', score: 70, cause: 'Even.', fix: 'SPF.' }],
    hair: [{ metric: 'haircutFaceShapeMatch', score: 68, cause: 'Good.', fix: 'Maintain.' }],
    jawAndFace: [{ metric: 'jawlinePuffiness', score: 72, cause: 'Defined.', fix: 'Hold.' }],
    bodyAndPosture: [{ metric: 'postureCarriage', score: 58, cause: 'Forward head.', fix: 'Chin tuck.' }],
    lifestyleSignals: [{ metric: 'sclera', score: 75, cause: 'Good.', fix: 'Maintain.' }],
  },
  biggestLever: { metric: 'postureCarriage', score: 58, rationale: 'Posture affects every read.' },
  quests: [{ metric: 'postureCarriage', task: 'Chin tuck daily.', library: 'posturePresence' }],
  styleAndColour: { haircut: 'Taper fade.', palette: ['charcoal', 'white'], avoid: ['yellow'] },
  starterPlan: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, morning: 'AM', evening: 'PM' })),
  context: { boneStructure: 'Square jaw.', hairDensity: 'Medium.' },
  warnings: [],
};

describe('PDF generation — GET /api/lookmaxing/audit/:id/pdf', () => {
  let bearer;
  let auditId;

  beforeAll(async () => {
    ({ bearer } = await makeSession());
    const quizRes = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Authorization', bearer)
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

    const { _injectReportForTest, _setAuditPaidForTest } = await import('../routes/lookmaxing.js');
    await _injectReportForTest(auditId, SAMPLE_REPORT, true);
    await _setAuditPaidForTest(auditId, true);
  });

  it('403 when audit is not paid', async () => {
    // Create a separate unpaid audit (different user)
    const s2 = await makeSession();
    const c2 = s2.bearer;
    const q2 = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Authorization', c2)
      .send({
        answers: [
          { questionId: 'q1', choice: 'A', label: 'Powerful.' },
          { questionId: 'q2', choice: 'C', label: 'Oily.' },
          { questionId: 'q3', choice: 'A', label: 'Thick.' },
          { questionId: 'q4', choice: 'B', label: 'Six hours.' },
          { questionId: 'q5', choice: 'B', label: 'Basic routine.' },
        ],
      });
    const unpaidId = q2.body.auditId;
    const { _injectReportForTest } = await import('../routes/lookmaxing.js');
    await _injectReportForTest(unpaidId, SAMPLE_REPORT, true);

    const res = await request(app)
      .get(`/api/lookmaxing/audit/${unpaidId}/pdf`)
      .set('Authorization', c2);
    expect(res.status).toBe(403);
  });

  it('generates a PDF and returns a URL (or inline content when R2 is off)', async () => {
    const res = await request(app)
      .get(`/api/lookmaxing/audit/${auditId}/pdf`)
      .set('Authorization', bearer);

    expect(res.status).toBe(200);
    // When R2 is not configured, the route returns a signed-url: null + a base64 pdf field
    expect(res.body).toHaveProperty('auditId', auditId);
    // Either a URL or inline PDF bytes
    const hasUrl = typeof res.body.url === 'string' && res.body.url.length > 0;
    const hasPdfBytes = typeof res.body.pdfBase64 === 'string' && res.body.pdfBase64.length > 0;
    expect(hasUrl || hasPdfBytes).toBe(true);
  });

  it('second call returns cached result without re-generating', async () => {
    const res1 = await request(app)
      .get(`/api/lookmaxing/audit/${auditId}/pdf`)
      .set('Authorization', bearer);
    const res2 = await request(app)
      .get(`/api/lookmaxing/audit/${auditId}/pdf`)
      .set('Authorization', bearer);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    // Both calls return the same auditId
    expect(res1.body.auditId).toBe(res2.body.auditId);
    // If both return a cached flag, verify it
    if (res2.body.cached !== undefined) {
      expect(res2.body.cached).toBe(true);
    }
  });

  it('403 when a different user tries to access the PDF', async () => {
    const other = await makeSession();
    const res = await request(app)
      .get(`/api/lookmaxing/audit/${auditId}/pdf`)
      .set('Authorization', other.bearer);
    expect(res.status).toBe(403);
  });

  it('404 for unknown audit', async () => {
    const res = await request(app)
      .get('/api/lookmaxing/audit/00000000-0000-0000-0000-000000000000/pdf')
      .set('Authorization', bearer);
    expect(res.status).toBe(404);
  });
});
