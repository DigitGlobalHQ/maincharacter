import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-seed-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.AUDIT_SESSIONS_FILE_PATH = path.join(tmpDir, 'audit-sessions.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.ADMIN_PASSWORD = 'seedpass123';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.WHATSAPP_SEND_MODE = 'off';

const request = require('supertest');
const express = require('express');
const adminRouter = require('../routes/admin');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

let token;
beforeAll(async () => {
  const login = await request(app).post('/api/admin/login').send({ password: 'seedpass123' });
  token = login.body.token;
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('POST /api/admin/seed-test-user', () => {
  it('rejects an unauthenticated caller', async () => {
    // The shared admin middleware returns 401 for missing/invalid creds (the
    // codebase convention; the brief loosely says "403" = simply not allowed).
    const res = await request(app)
      .post('/api/admin/seed-test-user')
      .send({ phone: '918595833852', name: 'NoAuth' });
    expect(res.status).toBe(401);
  });

  it('creates a fully-activated Aura++ user with a synthetic audit', async () => {
    const res = await request(app)
      .post('/api/admin/seed-test-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '918595833852', name: 'Chitranshu', weakestAxis: 'hairDensity' });
    expect(res.status).toBe(200);
    expect(res.body.user.oratorActive).toBe(true);
    expect(res.body.user.lookmaxxingActive).toBe(true);
    expect(res.body.user.auraPlusPlus).toBe(true);
    expect(res.body.user.mirrorLevel).toBe('raw');
    expect(res.body.user.weakestAxis).toBe('hairDensity');
    expect(res.body.user.auditSessionId).toBeTruthy();
    expect(res.body.loginUrl).toContain('/lookmax/admin-login?phone=918595833852');

    const u = User.getUserByPhone('918595833852');
    expect(u.lookmaxxingStartedAt).toBeTruthy();
  });

  it('defaults weakestAxis to hairDensity when omitted/invalid', async () => {
    const res = await request(app)
      .post('/api/admin/seed-test-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '919000000099', name: 'Default', weakestAxis: 'notAnAxis' });
    expect(res.body.user.weakestAxis).toBe('hairDensity');
  });

  it('is idempotent by phone — a second seed updates, never duplicates', async () => {
    const first = await request(app)
      .post('/api/admin/seed-test-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '919111111111', name: 'Once', weakestAxis: 'skinClarity' });
    const second = await request(app)
      .post('/api/admin/seed-test-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '919111111111', name: 'Twice', weakestAxis: 'posture' });
    expect(second.status).toBe(200);
    expect(second.body.user.token).toBe(first.body.user.token); // same record
    expect(second.body.user.name).toBe('Twice'); // updated
    expect(second.body.user.weakestAxis).toBe('posture');

    const all = User.getAllUsers();
    const matches = Object.values(all).filter((u) => u.phone === '919111111111');
    expect(matches.length).toBe(1);
  });

  it('rejects an invalid phone', async () => {
    const res = await request(app)
      .post('/api/admin/seed-test-user')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '123', name: 'Bad' });
    expect(res.status).toBe(400);
  });
});
