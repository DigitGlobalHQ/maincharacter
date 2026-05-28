/**
 * tests/admin-timewarp.test.js
 * POST /api/admin/timewarp — adjust lookmaxxingStartedAt for time-based testing
 *
 * Tests:
 *  - auth required
 *  - updates lookmaxxingStartedAt to given ISO timestamp
 *  - daysAgo convenience param (server computes now - N*86400000)
 *  - idempotent — re-running produces same logical result
 *  - rejects unknown email
 *  - rejects non-ISO timestamp
 *  - audit-logged
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-timewarp-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.AUDIT_SESSIONS_FILE_PATH = path.join(tmpDir, 'audit-sessions.json');
process.env.COMP_GRANTS_FILE_PATH = path.join(tmpDir, 'comp_grants.jsonl');
process.env.TIMEWARP_LOG_FILE_PATH = path.join(tmpDir, 'timewarp.jsonl');
process.env.ADMIN_PASSWORD = 'testpass-tw';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.UPGRADE_BASE_URL = 'https://test.local';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const adminRouter = require('../routes/admin');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

let token;
beforeAll(async () => {
  const login = await request(app).post('/api/admin/login').send({ password: 'testpass-tw' });
  token = login.body.token;

  // Seed a comp user for timewarp tests
  await request(app)
    .post('/api/admin/grant')
    .set('Authorization', `Bearer ${token}`)
    .send({ email: 'warp@example.com', plans: ['orator', 'lookmaxxing'], reason: 'timewarp seed' });
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('POST /api/admin/timewarp — auth', () => {
  it('rejects unauthenticated caller with 401', async () => {
    const res = await request(app)
      .post('/api/admin/timewarp')
      .send({ email: 'warp@example.com', daysAgo: 30 });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/timewarp — validation', () => {
  it('rejects unknown email with 404', async () => {
    const res = await request(app)
      .post('/api/admin/timewarp')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'nobody@example.com', daysAgo: 30 });
    expect(res.status).toBe(404);
  });

  it('rejects when neither lookmaxxingStartedAt nor daysAgo provided', async () => {
    const res = await request(app)
      .post('/api/admin/timewarp')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'warp@example.com' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-ISO lookmaxxingStartedAt string', async () => {
    const res = await request(app)
      .post('/api/admin/timewarp')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'warp@example.com', lookmaxxingStartedAt: 'not-a-date' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/timewarp — happy path', () => {
  it('updates lookmaxxingStartedAt to the given ISO timestamp', async () => {
    const ts = '2026-04-28T00:00:00.000Z';
    const res = await request(app)
      .post('/api/admin/timewarp')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'warp@example.com', lookmaxxingStartedAt: ts });

    expect(res.status).toBe(200);
    expect(res.body.lookmaxxingStartedAt).toBe(ts);

    const u = User.getUserByEmail('warp@example.com');
    expect(u.lookmaxxingStartedAt).toBe(ts);
  });

  it('updates lookmaxxingStartedAt using daysAgo convenience param', async () => {
    const before = Date.now();
    const res = await request(app)
      .post('/api/admin/timewarp')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'warp@example.com', daysAgo: 30 });
    const after = Date.now();

    expect(res.status).toBe(200);
    const computedTs = new Date(res.body.lookmaxxingStartedAt).getTime();
    // Should be approximately now - 30*86400000
    const expectedApprox = before - 30 * 86400000;
    expect(computedTs).toBeGreaterThanOrEqual(expectedApprox - 5000);
    expect(computedTs).toBeLessThanOrEqual(after - 30 * 86400000 + 5000);
  });

  it('is idempotent — re-running with same params produces same result', async () => {
    const ts = '2026-03-01T00:00:00.000Z';
    await request(app)
      .post('/api/admin/timewarp')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'warp@example.com', lookmaxxingStartedAt: ts });

    const second = await request(app)
      .post('/api/admin/timewarp')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'warp@example.com', lookmaxxingStartedAt: ts });

    expect(second.status).toBe(200);
    expect(second.body.lookmaxxingStartedAt).toBe(ts);
  });
});

describe('POST /api/admin/timewarp — audit log', () => {
  it('appends a record to timewarp log file', async () => {
    const logFile = process.env.TIMEWARP_LOG_FILE_PATH;
    if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

    await request(app)
      .post('/api/admin/timewarp')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'warp@example.com', daysAgo: 30 });

    expect(fs.existsSync(logFile)).toBe(true);
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.email).toBe('warp@example.com');
    expect(entry.ts).toBeTruthy();
    expect(entry.lookmaxxingStartedAt).toBeTruthy();
  });
});
