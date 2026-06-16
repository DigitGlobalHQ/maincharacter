import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-admin-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.AUDIT_V2_STORE_PATH = path.join(tmpDir, 'audit-v2.json');
process.env.ADMIN_PASSWORD = 'secret123';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.WHATSAPP_SEND_MODE = 'off';

const request = require('supertest');
const express = require('express');
const adminRouter = require('../routes/admin');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('POST /api/admin/login', () => {
  it('rejects a wrong password', async () => {
    const res = await request(app).post('/api/admin/login').send({ password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('returns a JWT for the correct password', async () => {
    const res = await request(app).post('/api/admin/login').send({ password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

describe('admin route auth', () => {
  it('rejects unauthenticated /stats with 401', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(401);
  });

  it('accepts a valid Bearer token', async () => {
    const login = await request(app).post('/api/admin/login').send({ password: 'secret123' });
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalUsers');
  });

  it('accepts the legacy header only while no hash is configured', async () => {
    const res = await request(app).get('/api/admin/stats').set('x-admin-password', 'secret123');
    expect(res.status).toBe(200);
  });
});

describe('POST /api/admin/test-alert (Slack wiring verification)', () => {
  it('401 without auth', async () => {
    const res = await request(app).post('/api/admin/test-alert');
    expect(res.status).toBe(401);
  });

  it('fires a dry-run alert and reports configured:false when no webhook is set', async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    const login = await request(app).post('/api/admin/login').send({ password: 'secret123' });
    const res = await request(app)
      .post('/api/admin/test-alert')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({ severity: 'warning' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.configured).toBe(false);
    expect(res.body.severity).toBe('warning');
  });

  it('defaults to critical severity when none is given', async () => {
    const login = await request(app).post('/api/admin/login').send({ password: 'secret123' });
    const res = await request(app)
      .post('/api/admin/test-alert')
      .set('Authorization', `Bearer ${login.body.token}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.severity).toBe('critical');
  });
});

describe('GET /api/admin/lookmax-users (funnel-repair Item 3)', () => {
  it('401 without auth', async () => {
    const res = await request(app).get('/api/admin/lookmax-users');
    expect(res.status).toBe(401);
  });

  it('lists signed-up users with email, signup date, paid flag, and stage', async () => {
    const User = require('../models/User');
    await User.getOrCreateByEmail({ email: 'admin-list@example.com', name: 'Lister' });
    const login = await request(app).post('/api/admin/login').send({ password: 'secret123' });
    const res = await request(app)
      .get('/api/admin/lookmax-users')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('count');
    expect(res.body).toHaveProperty('paidCount');
    const row = (res.body.users || []).find((u) => u.email === 'admin-list@example.com');
    expect(row).toBeTruthy();
    expect(row.stage).toBe('signed_up');
    expect(row.paid99).toBe(false);
    expect(row).toHaveProperty('signupAt');
  });
});
