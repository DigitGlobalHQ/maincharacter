import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-confirm-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.RAZORPAY_KEY_SECRET = 'sekret_for_test';

const request = require('supertest');
const express = require('express');
const apiRouter = require('../routes/api');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('public/payment-confirmed.html structure', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'payment-confirmed.html'), 'utf8');
  it('has the Consultant headline and reads the status endpoint', () => {
    expect(html).toContain('The Chamber is open');
    expect(html).toContain('/api/payment/status');
    expect(html).toContain('razorpay_subscription_id');
  });
  it('holds the graceful verification-pending error copy', () => {
    expect(html).toContain('being verified');
    expect(html).toContain('support@maincharacter.digitglobalservices.com');
  });
});

describe('GET /api/payment/status', () => {
  it('400 without a subscriptionId', async () => {
    const res = await request(app).get('/api/payment/status');
    expect(res.status).toBe(400);
  });

  it('found:false for an unknown subscription id', async () => {
    const res = await request(app).get('/api/payment/status').query({ subscriptionId: 'sub_unknown' });
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(false);
  });

  it('returns activation flags for a known subscription (verified:false without a valid signature)', async () => {
    const user = User.createUser({ name: 'Nyx', phone: '919000000020' });
    User.updateUser('919000000020', {
      razorpaySubscriptionId: 'sub_known_1',
      oratorActive: true,
      pendingPlan: 'seeker',
      subscriptionStatus: 'active',
    });
    const res = await request(app).get('/api/payment/status').query({ subscriptionId: 'sub_known_1' });
    expect(res.body.found).toBe(true);
    expect(res.body.name).toBe('Nyx');
    expect(res.body.oratorActive).toBe(true);
    expect(res.body.planLabel).toBe('The Seeker Plan');
    expect(res.body.amount).toBe(79900);
    expect(res.body.verified).toBe(false); // no signature supplied
    expect(user).toBeTruthy();
  });

  it('verifies a correct Razorpay subscription signature', async () => {
    User.createUser({ name: 'Ovi', phone: '919000000021' });
    User.updateUser('919000000021', { razorpaySubscriptionId: 'sub_known_2', oratorActive: true });
    const paymentId = 'pay_abc';
    const subscriptionId = 'sub_known_2';
    const signature = crypto
      .createHmac('sha256', 'sekret_for_test')
      .update(`${paymentId}|${subscriptionId}`)
      .digest('hex');
    const res = await request(app)
      .get('/api/payment/status')
      .query({ subscriptionId, paymentId, signature });
    expect(res.body.found).toBe(true);
    expect(res.body.verified).toBe(true);
  });

  it('reports auraPlusPlus when both pillars are active', async () => {
    User.createUser({ name: 'Pax', phone: '919000000022' });
    User.updateUser('919000000022', {
      razorpaySubscriptionId: 'sub_known_3',
      oratorActive: true,
      lookmaxxingActive: true,
    });
    const res = await request(app).get('/api/payment/status').query({ subscriptionId: 'sub_known_3' });
    expect(res.body.auraPlusPlus).toBe(true);
    expect(res.body.planKey).toBe('auraplus');
  });
});

describe('first-Orator-message scheduling on activation (P6.4)', () => {
  it('primes a fresh paywall Orator (day 0, no prior morning) for Day-1 scheduling', async () => {
    User.createUser({ name: 'Quill', phone: '919000000023' });
    await apiRouter.processPaymentEvent({
      event: 'subscription.activated',
      payload: {
        subscription: { entity: { id: 'sub_q', notes: { phone: '919000000023', plan: 'seeker' } } },
      },
    });
    const u = User.getUserByPhone('919000000023');
    expect(u.oratorActive).toBe(true);
    expect(u.day).toBe(0);
    expect(u.awaitingResponse).toBe(false);
    expect(u.status).toBe('active'); // scheduler will pick this up at preferredTime
  });

  it('does not reset a trial user already mid-protocol (day > 0)', async () => {
    User.createUser({ name: 'Rho', phone: '919000000024' });
    User.updateUser('919000000024', { day: 3, awaitingResponse: true, lastMorningSent: new Date().toISOString() });
    await apiRouter.processPaymentEvent({
      event: 'subscription.activated',
      payload: {
        subscription: { entity: { id: 'sub_r', notes: { phone: '919000000024', plan: 'seeker' } } },
      },
    });
    const u = User.getUserByPhone('919000000024');
    expect(u.oratorActive).toBe(true);
    expect(u.day).toBe(3); // untouched
    expect(u.awaitingResponse).toBe(true);
  });
});
