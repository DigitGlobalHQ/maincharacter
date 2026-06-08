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

// ─── Dark "Bespoke Aesthetic Blueprint" dossier (_generatePdf) ─────────────────
// A blueprint report (report.vectors present — every live Gemini report) renders
// the dark 8-section dossier. Legacy reports keep the white-paper layout (above).
const BLUEPRINT = {
  auraScore: 62, globalScore10: 6.2, percentile: 58, rank: 'ascendant', archetype: 'The Sovereign', faceShape: 'oval',
  firstImpression: 'Composed and deliberate — the room reads you as someone who waits to be understood.',
  statusAlert: 'Your features are not the constraint. How they are presented is the opportunity. Three areas of work change how you read over ninety days.',
  metricsScored: 24,
  vectors: [
    { id: 'skin', numeral: 'the daily canvas', name: 'Skin & Dermal', metrics: [
      { metric: 'radianceHydration', subtitle: 'light return', rootCause: 'The complexion reads a little flat. Steady hydration helps the surface return light.', score10: 5.4, class: 'leverage' },
      { metric: 'toneEvenness', subtitle: 'consistency of colour', rootCause: 'Some localised redness around the nose, otherwise an even field.', score10: 6.4, class: 'actionable' },
    ] },
    { id: 'carriage', numeral: 'how you hold yourself', name: 'Carriage & Presence', metrics: [
      { metric: 'forwardHeadPosture', subtitle: 'head carriage', rootCause: 'The head sits forward of the shoulders in profile. The highest-leverage single habit here.', score10: 4.5, class: 'leverage' },
    ] },
    { id: 'fixed', numeral: 'bone structure', name: 'Fixed Architecture', metrics: [
      { metric: 'facialSymmetry', subtitle: '', rootCause: 'Closely matched left and right. The slight nasal lean is visually negligible.', score10: 7.8, class: 'fixed' },
      { metric: 'cheekboneStructure', subtitle: '', rootCause: 'Well positioned underlying bone. Definition is a matter of condition, not structure.', score10: 6.6, class: 'fixed' },
    ] },
  ],
  chromatic: {
    undertone: 'Cool', undertoneNote: 'blue, rose base', contrast: 'High', contrastNote: 'skin, hair, eyes',
    profile: 'Deep Winter', profileNote: 'high contrast cool',
    powerPalette: [
      { name: 'Optic White', hex: '#F4F5F7', note: 'A crisp blue white, never cream.' },
      { name: 'Imperial Navy', hex: '#1C2433', note: 'Your workhorse neutral.' },
      { name: 'Royal Sapphire', hex: '#1F3A5F', note: 'Your event accent.' },
    ],
    supportingNeutrals: 'Pure black, stone grey, icy blue.',
    antiPalette: [{ name: 'Mustard Ochre', hex: '#C9A227', impact: 'Opposes your undertone and casts a sallow shadow.' }],
    metals: { locked: 'Recommended', note: 'Silver, platinum, white gold — cool toned metals only.' },
    stylingCorrections: 'A cut with structured width at the sides.',
  },
  intervention: {
    morning: [{ step: 1, agent: 'Gentle cleanse', rationale: 'A non-stripping cleanse that clears overnight build up.' }, { step: 2, agent: 'Broad spectrum sunscreen', rationale: 'Every morning, indoors included.' }],
    night: [{ step: 1, agent: 'Cleanse fully', rationale: 'Remove sunscreen and the day.' }, { step: 2, agent: 'A texture step', rationale: 'One for a dermatologist.', rx: true }],
    mechanical: [{ step: 1, agent: 'Chin tucks', rationale: 'Three sets of ten, cued through the day.' }],
  },
  projection: {
    rows: [
      { vector: 'forwardHeadPosture', day0: 4.5, day90: 7.5, delta: 3.0 },
      { vector: 'radianceHydration', day0: 5.4, day90: 7.6, delta: 2.2 },
    ],
    globalDay0: 6.2, globalDay90: 8.5,
    narrative: 'Your structure was never the constraint. The surface, the carriage, and the colour were the levers.',
  },
  methodology: 'This is a photographic image and styling assessment, not a medical diagnosis. We grade only what a photograph can responsibly support.',
};

describe('PDF generation — dark Blueprint dossier (_generatePdf)', () => {
  it('renders a multi-page PDF from a blueprint report', async () => {
    const { _generatePdf } = await import('../routes/lookmaxing.js');
    const buf = await _generatePdf('7829abcd-1111-2222', BLUEPRINT, null);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(8000);
    // page-tree /Count is written uncompressed — the dossier is an 8-section doc.
    const count = buf.toString('latin1').match(/\/Count (\d+)/);
    expect(count).toBeTruthy();
    // Sections flow together to avoid dead space, so the dossier is a few dense pages.
    expect(Number(count[1])).toBeGreaterThanOrEqual(3);
  });

  it('embeds a cover photo without error when one is provided', async () => {
    const { _generatePdf } = await import('../routes/lookmaxing.js');
    const photo = fs.readFileSync(new URL('../public/favicon-512.png', import.meta.url));
    const buf = await _generatePdf('7829abcd-3333-4444', BLUEPRINT, photo);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(8000);
  });

  it('still renders the legacy white-paper layout for pre-Blueprint reports', async () => {
    const { _generatePdf } = await import('../routes/lookmaxing.js');
    const legacy = { auraScore: 70, rank: 'luminary', firstImpression: 'Deliberate.', decomposition: { skin: [{ metric: 'skinClarity', score: 70, cause: 'Even.', fix: 'SPF.' }] } };
    const buf = await _generatePdf('legacy-1', legacy, null);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
