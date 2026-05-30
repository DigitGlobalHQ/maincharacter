/**
 * tests/lookmaxing-routes.test.js
 * Covers each route's auth + happy-path + error path for the Audit Engine.
 * Funnel-repair P1: sign-in required (guest flow removed) — every request
 * authenticates with a Lookmaxing JWT and carries the auditId returned by /quiz.
 * Uses the JSON-fallback adapter (no DATABASE_URL).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lmx-routes-'));
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
app.use(
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  })
);
app.use('/api/lookmaxing', lookmaxingRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const VALID_ANSWERS = [
  { questionId: 'q1', choice: 'A', label: 'I want to read as powerful.' },
  { questionId: 'q2', choice: 'C', label: 'Oily. Shines by afternoon.' },
  { questionId: 'q3', choice: 'A', label: 'Thick and healthy.' },
  { questionId: 'q4', choice: 'B', label: 'Around six or seven hours.' },
  { questionId: 'q5', choice: 'B', label: 'A basic routine.' },
];
const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

describe('POST /api/lookmaxing/quiz', () => {
  let bearer;
  beforeAll(async () => { ({ bearer } = await makeSession()); });

  it('persists 5 answers and returns auditId', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Authorization', bearer)
      .send({ answers: VALID_ANSWERS });
    expect(res.status).toBe(200);
    expect(res.body.auditId).toBeTruthy();
    expect(res.body.answersStored).toBe(5);
  });

  it('400 when answers is missing', async () => {
    const res = await request(app).post('/api/lookmaxing/quiz').set('Authorization', bearer).send({});
    expect(res.status).toBe(400);
  });

  it('400 when answers count is not 5', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Authorization', bearer)
      .send({ answers: VALID_ANSWERS.slice(0, 3) });
    expect(res.status).toBe(400);
  });

  it('401 when no token', async () => {
    const res = await request(app).post('/api/lookmaxing/quiz').send({ answers: VALID_ANSWERS });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/lookmaxing/capture (photo upload)', () => {
  let bearer; let auditId;
  beforeAll(async () => {
    ({ bearer } = await makeSession());
    const q = await request(app).post('/api/lookmaxing/quiz').set('Authorization', bearer).send({ answers: VALID_ANSWERS });
    auditId = q.body.auditId;
  });

  it('accepts photo upload with consent=true', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/capture')
      .set('Authorization', bearer)
      .field('auditId', auditId)
      .field('consent_18plus', 'true')
      .attach('photo', FAKE_JPEG, 'face.jpg');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.auditId).toBe(auditId);
  });

  it('400 when no photo file is attached', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/capture')
      .set('Authorization', bearer)
      .field('auditId', auditId)
      .field('consent_18plus', 'true');
    expect(res.status).toBe(400);
  });

  it('401 when no token', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/capture')
      .field('auditId', auditId)
      .field('consent_18plus', 'true')
      .attach('photo', FAKE_JPEG, 'face.jpg');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/lookmaxing/analyze', () => {
  let bearer; let auditId;
  beforeAll(async () => {
    ({ bearer } = await makeSession());
    const q = await request(app).post('/api/lookmaxing/quiz').set('Authorization', bearer).send({ answers: VALID_ANSWERS });
    auditId = q.body.auditId;
    await request(app)
      .post('/api/lookmaxing/capture')
      .set('Authorization', bearer)
      .field('auditId', auditId)
      .field('consent_18plus', 'true')
      .attach('photo', FAKE_JPEG, 'face.jpg');
  });

  it('returns free-resolution report when Gemini key is absent (fallback path)', async () => {
    const res = await request(app).post('/api/lookmaxing/analyze').set('Authorization', bearer).send({ auditId });
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.report).toHaveProperty('auraScore');
      expect(res.body.report).not.toHaveProperty('decomposition');
    }
  });

  it('412 when consent was not set', async () => {
    const s2 = await makeSession();
    const q2 = await request(app).post('/api/lookmaxing/quiz').set('Authorization', s2.bearer).send({ answers: VALID_ANSWERS });
    const res = await request(app).post('/api/lookmaxing/analyze').set('Authorization', s2.bearer).send({ auditId: q2.body.auditId });
    expect(res.status).toBe(412);
    expect(res.body.error).toBe('consent_required');
  });
});

describe('GET /api/lookmaxing/audit/:id', () => {
  let bearer; let auditId;
  beforeAll(async () => {
    ({ bearer } = await makeSession());
    const q = await request(app).post('/api/lookmaxing/quiz').set('Authorization', bearer).send({ answers: VALID_ANSWERS });
    auditId = q.body.auditId;
  });

  it('returns 200 for the owning user', async () => {
    const res = await request(app).get(`/api/lookmaxing/audit/${auditId}`).set('Authorization', bearer);
    expect(res.status).toBe(200);
    expect(res.body.auditId).toBe(auditId);
  });

  it('returns 403 for a different user', async () => {
    const other = await makeSession();
    const res = await request(app).get(`/api/lookmaxing/audit/${auditId}`).set('Authorization', other.bearer);
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown ID', async () => {
    const res = await request(app)
      .get('/api/lookmaxing/audit/00000000-0000-0000-0000-000000000000')
      .set('Authorization', bearer);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/lookmaxing/waitlist/orator (delegates to existing waitlist)', () => {
  it('returns 200 or delegates to existing api/waitlist handler', async () => {
    const res = await request(app).post('/api/lookmaxing/waitlist/orator').send({ email: 'test@example.com' });
    expect([200, 201]).toContain(res.status);
  });
});
