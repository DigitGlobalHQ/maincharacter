import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-admin-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
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
