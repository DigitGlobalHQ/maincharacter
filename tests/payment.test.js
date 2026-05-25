import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const SECRET = 'test_webhook_secret_123';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-pay-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
process.env.WATI_SEND_MODE = 'off';

const request = require('supertest');
const express = require('express');
const razorpay = require('../services/razorpay');
const apiRouter = require('../routes/api');
const User = require('../models/User');

const app = express();
app.use(express.json({ verify: (req, _res, buf) => (req.rawBody = buf) }));
app.use('/api', apiRouter);

function sign(raw) {
  return crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}

beforeAll(() => {
  User.createUser({ name: 'Zed', phone: '918000000009', preferredTime: '08:00' });
  User.createUser({ name: 'Mara', phone: '918000000010', preferredTime: '08:00' });
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('razorpay.verifyWebhookSignature', () => {
  it('accepts a correctly signed body', () => {
    const raw = JSON.stringify({ a: 1 });
    expect(razorpay.verifyWebhookSignature(raw, sign(raw))).toBe(true);
  });
  it('rejects a tampered body', () => {
    const raw = JSON.stringify({ a: 1 });
    expect(razorpay.verifyWebhookSignature(JSON.stringify({ a: 2 }), sign(raw))).toBe(false);
  });
  it('rejects a missing signature', () => {
    expect(razorpay.verifyWebhookSignature('{}', undefined)).toBe(false);
  });
});

describe('processPaymentEvent', () => {
  it('upgrades user to active + seeker on payment_link.paid', async () => {
    await apiRouter.processPaymentEvent({
      event: 'payment_link.paid',
      payload: { payment_link: { entity: { notes: { phone: '918000000009' } } } },
    });
    const u = User.getUserByPhone('918000000009');
    expect(u.subscriptionStatus).toBe('active');
    expect(u.rank).toBe('seeker');
    expect(u.subscribedAt).toBeTruthy();
  });

  it('marks cancelled on subscription.cancelled', async () => {
    await apiRouter.processPaymentEvent({
      event: 'subscription.cancelled',
      payload: { subscription: { entity: { notes: { phone: '918000000010' } } } },
    });
    expect(User.getUserByPhone('918000000010').subscriptionStatus).toBe('cancelled');
  });

  it('ignores an event with no phone', async () => {
    const r = await apiRouter.processPaymentEvent({ event: 'payment.captured', payload: {} });
    expect(r.handled).toBe(false);
  });
});

describe('POST /api/payment/webhook', () => {
  it('rejects an invalid signature with 400', async () => {
    const res = await request(app)
      .post('/api/payment/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'deadbeef')
      .send(JSON.stringify({ event: 'payment.captured' }));
    expect(res.status).toBe(400);
  });

  it('accepts a valid signature and upgrades the user', async () => {
    const raw = JSON.stringify({
      event: 'payment_link.paid',
      payload: { payment_link: { entity: { notes: { phone: '918000000010' } } } },
    });
    const res = await request(app)
      .post('/api/payment/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sign(raw))
      .send(raw);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(User.getUserByPhone('918000000010').subscriptionStatus).toBe('active');
  });
});
