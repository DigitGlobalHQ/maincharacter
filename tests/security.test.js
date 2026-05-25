import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-sec-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.WATI_SEND_MODE = 'off';

const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');
const apiRouter = require('../routes/api');

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('enroll input validation (P4.5)', () => {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);

  it('rejects a non-numeric phone', async () => {
    const res = await request(app).post('/api/enroll').send({ name: 'Aria', phone: 'not-a-phone' });
    expect(res.status).toBe(400);
  });

  it('rejects an over-long name', async () => {
    const res = await request(app)
      .post('/api/enroll')
      .send({ name: 'x'.repeat(200), phone: '919000000001' });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed preferredTime', async () => {
    const res = await request(app)
      .post('/api/enroll')
      .send({ name: 'Aria', phone: '919000000002', preferredTime: '8am' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid payload', async () => {
    const res = await request(app)
      .post('/api/enroll')
      .send({ name: 'Aria', phone: '91 90000-00003', preferredTime: '08:00' });
    expect(res.status).toBe(200);
  });
});

describe('rate limiter behaviour + webhook exemption (P4.4)', () => {
  const app = express();
  const skipWebhooks = (req) => req.originalUrl.includes('/webhook');
  app.use(
    '/api',
    rateLimit({ windowMs: 60000, max: 3, skip: skipWebhooks, legacyHeaders: false })
  );
  app.get('/api/ping', (_req, res) => res.json({ ok: true }));
  app.post('/api/webhook/wati', (_req, res) => res.json({ ok: true }));

  it('returns 429 after the limit is exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).get('/api/ping')).status).toBe(200);
    }
    expect((await request(app).get('/api/ping')).status).toBe(429);
  });

  it('never rate-limits webhook paths', async () => {
    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line no-await-in-loop
      expect((await request(app).post('/api/webhook/wati')).status).toBe(200);
    }
  });
});
