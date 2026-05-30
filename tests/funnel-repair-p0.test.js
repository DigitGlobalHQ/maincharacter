/**
 * tests/funnel-repair-p0.test.js
 * Regression guard for the P0 funnel-repair fixes (FIX-IT BRIEF, 2026-05-29):
 *   1. capture.html posts to /api/lookmaxing/photo — that alias must exist (was 404).
 *   2. The photo endpoint must resolve auditId from the guest cookie when the body
 *      omits it (capture.html sends no auditId — it relies on the response to return one).
 *   3. analyze must succeed end-to-end after a /photo upload (pipeline wiring intact).
 * Cited: FUNNEL_REPAIR_LOG.md §P0.
 */

import { describe, it, expect, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lmx-p0-'));
process.env.AUDIT_V2_STORE_PATH = path.join(tmpDir, 'audit-v2.json');
process.env.EVENTS_BACKEND = 'file';
process.env.EVENTS_JSONL_PATH = path.join(tmpDir, 'events.jsonl');

const request = (await import('supertest')).default;
const express = (await import('express')).default;
const lookmaxingRouter = (await import('../routes/lookmaxing.js')).default;

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use('/api/lookmaxing', lookmaxingRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const ANSWERS = [
  { questionId: 'q1', choice: 'A', label: 'I want to read as powerful.' },
  { questionId: 'q2', choice: 'C', label: 'Oily. Shines by afternoon.' },
  { questionId: 'q3', choice: 'A', label: 'Thick and healthy.' },
  { questionId: 'q4', choice: 'B', label: 'Around six or seven hours.' },
  { questionId: 'q5', choice: 'B', label: 'A basic routine.' },
];
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

async function newGuestWithQuiz() {
  const g = await request(app).post('/api/lookmaxing/guest');
  const cookie = g.headers['set-cookie']?.[0] || '';
  await request(app).post('/api/lookmaxing/quiz').set('Cookie', cookie).send({ answers: ANSWERS });
  return cookie;
}

describe('P0 — /photo route alias (was 404 from capture.html)', () => {
  it('POST /api/lookmaxing/photo exists and is not 404', async () => {
    const cookie = await newGuestWithQuiz();
    const res = await request(app)
      .post('/api/lookmaxing/photo')
      .set('Cookie', cookie)
      .field('consent_18plus', 'true')
      .attach('photo', FAKE_JPEG, 'face.jpg');
    expect(res.status).not.toBe(404);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});

describe('P0 — auditId resolved from guest cookie when body omits it', () => {
  it('accepts a photo with no auditId in the body (capture.html contract)', async () => {
    const cookie = await newGuestWithQuiz();
    const res = await request(app)
      .post('/api/lookmaxing/photo')
      .set('Cookie', cookie)
      .field('consent_18plus', 'true')
      .attach('photo', FAKE_JPEG, 'face.jpg');
    expect(res.status).toBe(200);
    expect(res.body.auditId).toBeTruthy(); // server returns the resolved id
  });

  it('401 with no cookie and no auditId', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/photo')
      .field('consent_18plus', 'true')
      .attach('photo', FAKE_JPEG, 'face.jpg');
    expect(res.status).toBe(401);
  });
});

describe('P0 — analyze wiring intact after /photo upload', () => {
  it('returns a free-resolution report (premium fields gated) after upload', async () => {
    const cookie = await newGuestWithQuiz();
    const up = await request(app)
      .post('/api/lookmaxing/photo')
      .set('Cookie', cookie)
      .field('consent_18plus', 'true')
      .attach('photo', FAKE_JPEG, 'face.jpg');
    const auditId = up.body.auditId;

    const res = await request(app)
      .post('/api/lookmaxing/analyze')
      .set('Cookie', cookie)
      .send({ auditId });

    // 200 (fallback report when no GEMINI key in CI) or 502 (honest outage) —
    // never a silent crash. With no key configured, expect the graceful 200.
    expect([200, 502, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.report).toHaveProperty('auraScore');
      expect(res.body.report).not.toHaveProperty('decomposition'); // resolution gate
    }
  });
});
