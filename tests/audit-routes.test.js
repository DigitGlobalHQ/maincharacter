import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-auditroutes-'));
process.env.AUDIT_SESSIONS_FILE_PATH = path.join(tmpDir, 'audit-sessions.json');
process.env.UPLOAD_DIR = path.join(tmpDir, 'uploads');

const request = require('supertest');
const express = require('express');
const auditRouter = require('../routes/audit');

const app = express();
app.use(express.json());
app.use('/api/audit', auditRouter);

// A tiny valid-ish JPEG header buffer; storage stores bytes as-is (no sharp here).
const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('Audit funnel routes (P3.2/P3.5)', () => {
  it('runs the full happy path: session → quiz → photos → analyze → result', async () => {
    const s = await request(app).post('/api/audit/session').send({ intent: 'bundle' });
    expect(s.status).toBe(200);
    const token = s.body.sessionToken;
    expect(token).toBeTruthy();

    const quiz = await request(app)
      .post('/api/audit/quiz')
      .send({ sessionToken: token, answers: { skin1: 'water and out', goals: 'sharper jaw' } });
    expect(quiz.status).toBe(200);

    const photos = await request(app)
      .post('/api/audit/photos')
      .field('sessionToken', token)
      .attach('front', fakeJpeg, 'front.jpg')
      .attach('side', fakeJpeg, 'side.jpg')
      .attach('body', fakeJpeg, 'body.jpg');
    expect(photos.status).toBe(200);
    expect(photos.body.count).toBe(3);

    const analyze = await request(app).post('/api/audit/analyze').send({ sessionToken: token });
    expect(analyze.status).toBe(200);
    expect(Object.keys(analyze.body.scores)).toHaveLength(8);
    expect(analyze.body.diagnosis).toBeTruthy();

    const result = await request(app).get(`/api/audit/result/${token}`);
    expect(result.status).toBe(200);
    expect(result.body.scores).toEqual(analyze.body.scores);
    expect(result.body.intent).toBe('bundle');
  });

  it('cannot analyze a session with no photos (P3.5a)', async () => {
    const s = await request(app).post('/api/audit/session').send({});
    const token = s.body.sessionToken;
    await request(app).post('/api/audit/quiz').send({ sessionToken: token, answers: { a: 'b' } });
    const analyze = await request(app).post('/api/audit/analyze').send({ sessionToken: token });
    expect(analyze.status).toBe(400);
    expect(analyze.body.error).toMatch(/photos required/);
  });

  it('result before analysis returns 409', async () => {
    const s = await request(app).post('/api/audit/session').send({});
    const r = await request(app).get(`/api/audit/result/${s.body.sessionToken}`);
    expect(r.status).toBe(409);
  });

  it('rejects unknown/expired sessions', async () => {
    expect((await request(app).post('/api/audit/quiz').send({ sessionToken: 'nope', answers: {} })).status).toBe(404);
    expect((await request(app).post('/api/audit/analyze').send({ sessionToken: 'nope' })).status).toBe(404);
    expect((await request(app).get('/api/audit/result/nope')).status).toBe(404);
  });

  it('validates quiz input', async () => {
    const s = await request(app).post('/api/audit/session').send({});
    const bad = await request(app).post('/api/audit/quiz').send({ sessionToken: s.body.sessionToken });
    expect(bad.status).toBe(400);
  });
});
