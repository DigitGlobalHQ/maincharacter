import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-routes-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.ADMIN_PASSWORD = 'secret123';
delete process.env.ADMIN_PASSWORD_HASH;
delete process.env.RAZORPAY_KEY_ID;

const request = require('supertest');
const express = require('express');
const apiRouter = require('../routes/api');
const adminRouter = require('../routes/admin');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api', apiRouter);
app.use('/api/admin', adminRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('webhook command handlers', () => {
  beforeAll(() => {
    User.createUser({ name: 'Cmd', phone: '919700000001', preferredTime: '08:00' });
    User.updateUser('919700000001', { day: 2, status: 'active' });
  });

  it('STOP pauses the user', async () => {
    await apiRouter.processWhatsAppWebhook({ waId: '919700000001', text: 'STOP' });
    expect(User.getUserByPhone('919700000001').status).toBe('paused');
  });

  it('RETURN reactivates the user', async () => {
    await apiRouter.processWhatsAppWebhook({ waId: '919700000001', text: 'return' });
    expect(User.getUserByPhone('919700000001').status).toBe('active');
  });

  it('CONTINUE runs the payment-link handler without throwing', async () => {
    await expect(
      apiRouter.processWhatsAppWebhook({ waId: '919700000001', text: 'CONTINUE' })
    ).resolves.toBeUndefined();
  });

  it('unknown user pings admin path without throwing', async () => {
    await expect(
      apiRouter.processWhatsAppWebhook({ waId: '910000000000', text: 'hello' })
    ).resolves.toBeUndefined();
  });
});

describe('waitlist + user endpoints', () => {
  it('POST /api/waitlist adds and validates', async () => {
    const ok = await request(app).post('/api/waitlist').send({ phone: '9012223334', pillar: 'sage' });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/waitlist').send({ phone: '9012223334' });
    expect(bad.status).toBe(400);
  });

  it('GET /api/user/:token returns 404 for unknown, data (no phone) for known', async () => {
    expect((await request(app).get('/api/user/nope')).status).toBe(404);
    const u = User.createUser({ name: 'Tok', phone: '919700000009' });
    const res = await request(app).get('/api/user/' + u.token);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Tok');
    expect(res.body.phone).toBeUndefined(); // stripped
  });

  it('GET /api/payment/plans returns plans', async () => {
    const res = await request(app).get('/api/payment/plans');
    expect(res.body.seeker.amount).toBe(79900);
  });

  it('POST /api/payment/create-order (mock) returns an order', async () => {
    const res = await request(app)
      .post('/api/payment/create-order')
      .send({ plan: 'seeker', phone: '919700000009', name: 'Tok' });
    expect(res.status).toBe(200);
    expect(res.body.order.mock).toBe(true);
  });
});

describe('admin actions (with JWT)', () => {
  let token;
  beforeAll(async () => {
    User.createUser({ name: 'AdminTgt', phone: '919600000001' });
    const login = await request(app).post('/api/admin/login').send({ password: 'secret123' });
    token = login.body.token;
  });

  it('GET /stats returns aggregate shape', async () => {
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalUsers');
    expect(res.body).toHaveProperty('waitlist');
  });

  it('GET /user/:phone returns the record', async () => {
    const res = await request(app)
      .get('/api/admin/user/919600000001')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('AdminTgt');
  });

  it('POST /promote rejects an invalid rank, accepts a valid one', async () => {
    const bad = await request(app)
      .post('/api/admin/promote')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '919600000001', rank: 'wizard' });
    expect(bad.status).toBe(400);
    const ok = await request(app)
      .post('/api/admin/promote')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '919600000001', rank: 'ascendant' });
    expect(ok.status).toBe(200);
    expect(User.getUserByPhone('919600000001').rank).toBe('ascendant');
  });

  it('GET /export returns CSV', async () => {
    const res = await request(app)
      .get('/api/admin/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('csv');
  });

  it('POST /send-message validates input', async () => {
    const res = await request(app)
      .post('/api/admin/send-message')
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '919600000001' });
    expect(res.status).toBe(400);
  });
});
