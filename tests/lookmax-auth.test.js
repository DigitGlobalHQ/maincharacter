import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lmauth-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.ADMIN_PASSWORD = 'adminpass1';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES = '918595833852';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
delete process.env.WHATSAPP_ACCESS_TOKEN; // keep OTP dormant (DRY-RUN)
delete process.env.WHATSAPP_OTP_ENABLED;

const request = require('supertest');
const express = require('express');
const authRouter = require('../routes/lookmax-auth');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('POST /api/lookmax/auth/admin-login', () => {
  it('issues a lookmax-scoped token for an admin phone + correct password', async () => {
    const res = await request(app)
      .post('/api/lookmax/auth/admin-login')
      .send({ phone: '8595833852', password: 'adminpass1' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.phone).toBe('918595833852');
  });

  it('rejects a non-admin phone even with the right password', async () => {
    const res = await request(app)
      .post('/api/lookmax/auth/admin-login')
      .send({ phone: '919999999999', password: 'adminpass1' });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong password', async () => {
    const res = await request(app)
      .post('/api/lookmax/auth/admin-login')
      .send({ phone: '918595833852', password: 'nope' });
    expect(res.status).toBe(401);
  });
});

describe('OTP path is dormant until enabled', () => {
  it('request-otp returns unavailable when WhatsApp is in DRY-RUN', async () => {
    const res = await request(app)
      .post('/api/lookmax/auth/request-otp')
      .send({ phone: '919876543210' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('unavailable');
  });

  it('verify-otp rejects an unknown code', async () => {
    const res = await request(app)
      .post('/api/lookmax/auth/verify-otp')
      .send({ phone: '919876543210', otp: '000000' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/lookmax/me (requireLookmaxAuth)', () => {
  it('401s without a token', async () => {
    const res = await request(app).get('/api/lookmax/me');
    expect(res.status).toBe(401);
  });

  it('returns the user with a valid token', async () => {
    const login = await request(app)
      .post('/api/lookmax/auth/admin-login')
      .send({ phone: '8595833852', password: 'adminpass1' });
    const res = await request(app)
      .get('/api/lookmax/me')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('918595833852');
    expect(res.body.user).toHaveProperty('auraPlusPlus');
  });

  it('rejects an admin-scoped JWT (scope mismatch)', async () => {
    const adminAuth = require('../lib/auth');
    const adminToken = adminAuth.signAdminToken();
    const res = await request(app)
      .get('/api/lookmax/me')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(401);
  });
});
