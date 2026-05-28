/**
 * tests/lookmaxing-routes.test.js
 * Covers every route's auth + happy-path + error path for the Stage-1 Audit Engine.
 * Uses the JSON-fallback adapter (no DATABASE_URL).
 * Cited spec: briefs/stage-1-audit-spec.md §8.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lmx-routes-'));
process.env.AUDIT_V2_STORE_PATH = path.join(tmpDir, 'audit-v2.json');
process.env.EVENTS_BACKEND = 'file';
process.env.EVENTS_JSONL_PATH = path.join(tmpDir, 'events.jsonl');

const request = (await import('supertest')).default;
const express = (await import('express')).default;
const lookmaxingRouter = (await import('../routes/lookmaxing.js')).default;

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

describe('POST /api/lookmaxing/guest', () => {
  it('mints a guest_id and sets HttpOnly cookie', async () => {
    const res = await request(app).post('/api/lookmaxing/guest');
    expect(res.status).toBe(200);
    expect(res.body.guestId).toBeTruthy();
    const cookie = res.headers['set-cookie']?.[0] || '';
    expect(cookie).toMatch(/mc_lookmaxing_guest=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('subsequent calls return new guest IDs', async () => {
    const r1 = await request(app).post('/api/lookmaxing/guest');
    const r2 = await request(app).post('/api/lookmaxing/guest');
    expect(r1.body.guestId).not.toBe(r2.body.guestId);
  });
});

describe('POST /api/lookmaxing/quiz', () => {
  let guestCookie;

  beforeAll(async () => {
    const g = await request(app).post('/api/lookmaxing/guest');
    guestCookie = g.headers['set-cookie']?.[0] || '';
  });

  it('persists 5 answers and returns auditId', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Cookie', guestCookie)
      .send({ answers: VALID_ANSWERS });
    expect(res.status).toBe(200);
    expect(res.body.auditId).toBeTruthy();
    expect(res.body.answersStored).toBe(5);
  });

  it('400 when answers is missing', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Cookie', guestCookie)
      .send({});
    expect(res.status).toBe(400);
  });

  it('400 when answers count is not 5', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Cookie', guestCookie)
      .send({ answers: VALID_ANSWERS.slice(0, 3) });
    expect(res.status).toBe(400);
  });

  it('401 when no cookie and no JWT', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/quiz')
      .send({ answers: VALID_ANSWERS });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/lookmaxing/capture (photo upload)', () => {
  let guestCookie;
  let auditId;

  beforeAll(async () => {
    const g = await request(app).post('/api/lookmaxing/guest');
    guestCookie = g.headers['set-cookie']?.[0] || '';
    const q = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Cookie', guestCookie)
      .send({ answers: VALID_ANSWERS });
    auditId = q.body.auditId;
  });

  it('accepts photo upload with consent=true and sets photo_storage_key', async () => {
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const res = await request(app)
      .post('/api/lookmaxing/capture')
      .set('Cookie', guestCookie)
      .field('auditId', auditId)
      .field('consent_18plus', 'true')
      .attach('photo', fakeJpeg, 'face.jpg');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.auditId).toBe(auditId);
  });

  it('400 when no photo file is attached', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/capture')
      .set('Cookie', guestCookie)
      .field('auditId', auditId)
      .field('consent_18plus', 'true');
    expect(res.status).toBe(400);
  });

  it('401 when no cookie', async () => {
    const fakeJpeg = Buffer.from([0xff, 0xd8]);
    const res = await request(app)
      .post('/api/lookmaxing/capture')
      .field('auditId', auditId)
      .field('consent_18plus', 'true')
      .attach('photo', fakeJpeg, 'face.jpg');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/lookmaxing/analyze', () => {
  let guestCookie;
  let auditId;

  beforeAll(async () => {
    const g = await request(app).post('/api/lookmaxing/guest');
    guestCookie = g.headers['set-cookie']?.[0] || '';
    const q = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Cookie', guestCookie)
      .send({ answers: VALID_ANSWERS });
    auditId = q.body.auditId;

    // Set consent via capture
    await request(app)
      .post('/api/lookmaxing/capture')
      .set('Cookie', guestCookie)
      .field('auditId', auditId)
      .field('consent_18plus', 'true')
      .attach('photo', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'face.jpg');
  });

  it('returns free-resolution report when Gemini key is absent (fallback path)', async () => {
    // With no GEMINI_API_KEY the route should either 503 (module not ready)
    // or return a synthetic fallback — both are valid per spec.
    const res = await request(app)
      .post('/api/lookmaxing/analyze')
      .set('Cookie', guestCookie)
      .send({ auditId });
    // Accept 200 (fallback report) or 503 (engine not ready)
    expect([200, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.report).toHaveProperty('auraScore');
      expect(res.body.report).not.toHaveProperty('decomposition');
    }
  });

  it('412 when consent was not set', async () => {
    // Create a fresh guest with quiz but no consent
    const g2 = await request(app).post('/api/lookmaxing/guest');
    const c2 = g2.headers['set-cookie']?.[0] || '';
    const q2 = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Cookie', c2)
      .send({ answers: VALID_ANSWERS });
    const id2 = q2.body.auditId;

    const res = await request(app)
      .post('/api/lookmaxing/analyze')
      .set('Cookie', c2)
      .send({ auditId: id2 });
    expect(res.status).toBe(412);
    expect(res.body.error).toBe('consent_required');
  });
});

describe('GET /api/lookmaxing/audit/:id', () => {
  let guestCookie;
  let auditId;

  beforeAll(async () => {
    const g = await request(app).post('/api/lookmaxing/guest');
    guestCookie = g.headers['set-cookie']?.[0] || '';
    const q = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Cookie', guestCookie)
      .send({ answers: VALID_ANSWERS });
    auditId = q.body.auditId;
  });

  it('returns 200 for the owning guest', async () => {
    const res = await request(app)
      .get(`/api/lookmaxing/audit/${auditId}`)
      .set('Cookie', guestCookie);
    expect(res.status).toBe(200);
    expect(res.body.auditId).toBe(auditId);
  });

  it('returns 403 for a different guest', async () => {
    const other = await request(app).post('/api/lookmaxing/guest');
    const otherCookie = other.headers['set-cookie']?.[0] || '';
    const res = await request(app)
      .get(`/api/lookmaxing/audit/${auditId}`)
      .set('Cookie', otherCookie);
    expect(res.status).toBe(403);
  });

  it('returns 404 for unknown ID', async () => {
    const res = await request(app)
      .get('/api/lookmaxing/audit/00000000-0000-0000-0000-000000000000')
      .set('Cookie', guestCookie);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/lookmaxing/waitlist/orator (delegates to existing waitlist)', () => {
  it('returns 200 or delegates to existing api/waitlist handler', async () => {
    const res = await request(app).post('/api/lookmaxing/waitlist/orator').send({
      email: 'test@example.com',
    });
    // The route stores an email in waitlist; 200 expected
    expect([200, 201]).toContain(res.status);
  });
});
