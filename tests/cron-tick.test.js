/**
 * tests/cron-tick.test.js
 * Path-A resilience: the scheduler is decoupled into an HTTP-triggerable tick()
 * so an external pinger can drive the daily protocol on hosts that scale-to-zero.
 *
 *   - scheduler.tick() is idempotent and records health.
 *   - GET|POST /api/cron/tick is open+warn until CRON_SECRET is set.
 *   - once CRON_SECRET is set: wrong/absent secret → 403, correct secret → 200.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-cron-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.WHATSAPP_SEND_MODE = 'off'; // no real sends from the tick
process.env.ADMIN_PHONES = '918595833852';
process.env.JWT_SECRET = 'cron-test-secret';
delete process.env.CRON_SECRET;

const request = require('supertest');
const express = require('express');
const apiRouter = require('../routes/api');
const scheduler = require('../services/scheduler');

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('scheduler.tick()', () => {
  it('runs idempotently and records health (ticks increment, source recorded)', async () => {
    const before = scheduler.getHealth().ticks;
    const r1 = await scheduler.tick({ source: 'http' });
    expect(r1.ok).toBe(true);
    const r2 = await scheduler.tick({ source: 'http' }); // repeat = safe no-op
    expect(r2.ok).toBe(true);
    const h = scheduler.getHealth();
    expect(h.ticks).toBe(before + 2);
    expect(h.lastTickSource).toBe('http');
    expect(h.lastHttpTickAt).toBeTruthy();
  });
});

describe('GET|POST /api/cron/tick', () => {
  beforeAll(() => { delete process.env.CRON_SECRET; });

  it('is open (200) when CRON_SECRET is unset', async () => {
    const res = await request(app).get('/api/cron/tick');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.at).toBeTruthy();
  });

  it('accepts POST too', async () => {
    const res = await request(app).post('/api/cron/tick');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('rejects with 403 when CRON_SECRET is set and secret is wrong/absent', async () => {
    process.env.CRON_SECRET = 'topsecret';
    try {
      expect((await request(app).get('/api/cron/tick')).status).toBe(403);
      expect((await request(app).get('/api/cron/tick?key=nope')).status).toBe(403);
      expect((await request(app).get('/api/cron/tick').set('x-cron-secret', 'wrong')).status).toBe(403);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it('accepts the correct secret via header or ?key=', async () => {
    process.env.CRON_SECRET = 'topsecret';
    try {
      expect((await request(app).get('/api/cron/tick?key=topsecret')).status).toBe(200);
      expect((await request(app).get('/api/cron/tick').set('x-cron-secret', 'topsecret')).status).toBe(200);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});
