/**
 * tests/lookmaxing-consent.test.js
 * Verifies that /api/lookmaxing/analyze returns 412 when consent_18plus is false/missing.
 * Cited spec: briefs/stage-1-audit-spec.md §F (consent gate).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lmx-consent-'));
process.env.AUDIT_V2_STORE_PATH = path.join(tmpDir, 'audit-v2.json');
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.EVENTS_BACKEND = 'file';
process.env.EVENTS_JSONL_PATH = path.join(tmpDir, 'events.jsonl');
process.env.JWT_SECRET = 'test-jwt-secret';

const request = (await import('supertest')).default;
const express = (await import('express')).default;
const lookmaxingRouter = (await import('../routes/lookmaxing.js')).default;
const { makeSession } = await import('./helpers/lookmax-session.js');

const app = express();
app.use(express.json());
app.use('/api/lookmaxing', lookmaxingRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('Consent gate — /api/lookmaxing/analyze', () => {
  let bearer;
  let auditId;

  beforeAll(async () => {
    // Step 1: sign in (guest flow removed — funnel-repair P1)
    ({ bearer } = await makeSession());

    // Step 2: submit quiz answers
    const quizRes = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Authorization', bearer)
      .send({
        answers: [
          { questionId: 'q1', choice: 'A', label: 'I want to read as powerful.' },
          { questionId: 'q2', choice: 'C', label: 'Oily. Shines by afternoon.' },
          { questionId: 'q3', choice: 'A', label: 'Thick and healthy.' },
          { questionId: 'q4', choice: 'B', label: 'Around six or seven hours.' },
          { questionId: 'q5', choice: 'B', label: 'A basic routine.' },
        ],
      });
    expect(quizRes.status).toBe(200);
    auditId = quizRes.body.auditId;
    expect(auditId).toBeTruthy();
  });

  it('412 when consent_18plus is not set on the session', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/analyze')
      .set('Authorization', bearer)
      .send({ auditId });
    expect(res.status).toBe(412);
    expect(res.body.error).toBe('consent_required');
  });

  it('412 when consent_18plus is explicitly false', async () => {
    // Patch the session's consent flag to false via capture endpoint
    const captureRes = await request(app)
      .post('/api/lookmaxing/capture')
      .set('Authorization', bearer)
      .field('auditId', auditId)
      .field('consent_18plus', 'false')
      .attach('photo', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'face.jpg');
    // 200 or 400 — we just need the audit to exist with consent=false
    // The analyze call below is the real assertion.

    const res = await request(app)
      .post('/api/lookmaxing/analyze')
      .set('Authorization', bearer)
      .send({ auditId });
    expect(res.status).toBe(412);
    expect(res.body.error).toBe('consent_required');
  });
});
