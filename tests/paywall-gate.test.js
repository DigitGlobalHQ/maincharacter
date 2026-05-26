import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Isolated stores + dry-run messaging before requiring anything.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-paywall-gate-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.EARLY_ACCESS_FILE_PATH = path.join(tmpDir, 'early-access.json');
process.env.WHATSAPP_SEND_MODE = 'off';

const request = require('supertest');
const express = require('express');
const path2 = require('path');
const apiRouter = require('../routes/api');
const EarlyAccess = require('../models/EarlyAccess');

// Re-create the gated /paywall route exactly as server.js mounts it, so the
// flag behaviour is testable without booting the full server.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.get('/paywall', (req, res) => {
    if (process.env.PAYWALL_PUBLIC === 'true') {
      return res.sendFile(path2.join(__dirname, '..', 'public', 'paywall.html'));
    }
    res.sendFile(path2.join(__dirname, '..', 'public', 'paywall-waitlist.html'));
  });
  app.use('/api', apiRouter);
  return app;
}

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('paywall safety gate (PAYWALL_PUBLIC)', () => {
  beforeEach(() => {
    fs.writeFileSync(process.env.EARLY_ACCESS_FILE_PATH, '[]');
  });

  it('serves the waitlist page when the flag is off', async () => {
    delete process.env.PAYWALL_PUBLIC;
    const res = await request(buildApp()).get('/paywall');
    expect(res.status).toBe(200);
    expect(res.text).toContain('The Chamber opens this weekend');
    // The live 3-card paywall must NOT be reachable.
    expect(res.text).not.toContain('Choose the work');
  });

  it('serves the full paywall when the flag is on', async () => {
    process.env.PAYWALL_PUBLIC = 'true';
    const res = await request(buildApp()).get('/paywall');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Choose the work');
    delete process.env.PAYWALL_PUBLIC;
  });
});

describe('POST /api/waitlist/early-access', () => {
  beforeEach(() => {
    fs.writeFileSync(process.env.EARLY_ACCESS_FILE_PATH, '[]');
  });

  it('adds a valid submission to the store', async () => {
    const res = await request(buildApp())
      .post('/api/waitlist/early-access')
      .send({ name: 'Chitranshu', phone: '8595833852' });
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(true);
    expect(EarlyAccess.count()).toBe(1);
    expect(EarlyAccess.getAll()[0].phone).toBe('918595833852');
  });

  it('rejects an invalid phone', async () => {
    const res = await request(buildApp())
      .post('/api/waitlist/early-access')
      .send({ name: 'Bad', phone: '123' });
    expect(res.status).toBe(400);
  });

  it('gracefully no-ops on a duplicate phone', async () => {
    const app = buildApp();
    await request(app).post('/api/waitlist/early-access').send({ name: 'A', phone: '9000000001' });
    const res = await request(app)
      .post('/api/waitlist/early-access')
      .send({ name: 'A again', phone: '9000000001' });
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(false);
    expect(EarlyAccess.count()).toBe(1);
  });
});
