import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-subs-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.RAZORPAY_PLANS_FILE_PATH = path.join(tmpDir, 'razorpay-plans.json');
process.env.WHATSAPP_SEND_MODE = 'off';
// No RAZORPAY_KEY_ID → service runs in mock mode (deterministic, no live calls).

const request = require('supertest');
const express = require('express');
const razorpay = require('../services/razorpay');
const apiRouter = require('../routes/api');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('plan + bundle math (P4.2)', () => {
  it('maps plans to pillars', () => {
    expect(razorpay.pillarsForPlan('seeker')).toEqual(['orator']);
    expect(razorpay.pillarsForPlan('lookmaxxing')).toEqual(['lookmaxxing']);
    expect(razorpay.pillarsForPlan('auraplus')).toEqual(['orator', 'lookmaxxing']);
  });

  it('both pillars resolve to the Aura++ bundle (₹1,999, not the sum)', () => {
    expect(razorpay.resolvePlanForPillars(['orator', 'lookmaxxing'])).toBe('auraplus');
    expect(razorpay.PLANS.auraplus.amount).toBe(199900);
    // bundle saves ₹299 vs separate (79900 + 149900 = 229800 paise)
    expect(79900 + 149900 - razorpay.PLANS.auraplus.amount).toBe(29900); // ₹299
  });

  it('single pillar resolves to its own plan', () => {
    expect(razorpay.resolvePlanForPillars(['lookmaxxing'])).toBe('lookmaxxing');
    expect(razorpay.resolvePlanForPillars(['orator'])).toBe('seeker');
    expect(razorpay.resolvePlanForPillars([])).toBeNull();
  });

  it('createSubscription returns a checkout url in mock mode', async () => {
    const sub = await razorpay.createSubscription('lookmaxxing', { phone: '918000000900' });
    expect(sub.short_url).toContain('plan=lookmaxxing');
    expect(sub.mock).toBe(true);
  });
});

describe('POST /api/payment/subscribe (P4.3)', () => {
  it('creates a user with pending pillars and returns a url', async () => {
    const res = await request(app)
      .post('/api/payment/subscribe')
      .send({ pillars: ['lookmaxxing'], phone: '918000000901', name: 'Nia', email: 'n@x.io' });
    expect(res.status).toBe(200);
    expect(res.body.planKey).toBe('lookmaxxing');
    expect(res.body.amount).toBe(149900);
    const u = User.getUserByPhone('918000000901');
    expect(u.pendingPillars).toEqual(['lookmaxxing']);
    expect(u.email).toBe('n@x.io');
    expect(u.lookmaxxingActive).toBe(false); // not active until webhook
  });

  it('both pillars → auraplus bundle price', async () => {
    const res = await request(app)
      .post('/api/payment/subscribe')
      .send({ pillars: ['orator', 'lookmaxxing'], phone: '918000000902', name: 'Om' });
    expect(res.body.planKey).toBe('auraplus');
    expect(res.body.amount).toBe(199900);
  });

  it('links an audit session token', async () => {
    await request(app)
      .post('/api/payment/subscribe')
      .send({ pillars: ['lookmaxxing'], phone: '918000000903', name: 'Pa', auditSessionToken: 'sess-xyz' });
    expect(User.getUserByPhone('918000000903').auditSessionId).toBe('sess-xyz');
  });

  it('rejects a bad phone', async () => {
    const res = await request(app).post('/api/payment/subscribe').send({ pillars: ['orator'], phone: 'abc' });
    expect(res.status).toBe(400);
  });
});

describe('webhook flips pillar flags (P4.3/P4.5)', () => {
  const evt = (event, notes) => ({ event, payload: { subscription: { entity: { notes } } } });

  it('subscription.activated for lookmaxxing flips lookmaxxingActive + sets startedAt', async () => {
    const phone = '918000000910';
    User.createUser({ name: 'Q', phone });
    await apiRouter.processPaymentEvent(evt('subscription.activated', { phone, plan: 'lookmaxxing' }));
    const u = User.getUserByPhone(phone);
    expect(u.lookmaxxingActive).toBe(true);
    expect(u.oratorActive).toBe(false);
    expect(u.lookmaxxingStartedAt).toBeTruthy();
    expect(User.computeAuraStatus(u).auraPlusPlus).toBe(false);
  });

  it('auraplus activation flips both flags → Aura++', async () => {
    const phone = '918000000911';
    User.createUser({ name: 'R', phone });
    const r = await apiRouter.processPaymentEvent(evt('subscription.activated', { phone, plan: 'auraplus' }));
    const u = User.getUserByPhone(phone);
    expect(u.oratorActive).toBe(true);
    expect(u.lookmaxxingActive).toBe(true);
    expect(r.auraPlusPlus).toBe(true);
  });

  it('existing Orator user adds Lookmaxxing → upgrades to Aura++', async () => {
    const phone = '918000000912';
    User.createUser({ name: 'S', phone });
    await apiRouter.processPaymentEvent(evt('subscription.activated', { phone, plan: 'seeker' }));
    expect(User.computeAuraStatus(User.getUserByPhone(phone)).auraPlusPlus).toBe(false);
    await apiRouter.processPaymentEvent(evt('subscription.activated', { phone, plan: 'lookmaxxing' }));
    expect(User.computeAuraStatus(User.getUserByPhone(phone)).auraPlusPlus).toBe(true);
  });

  it('cancelling one pillar leaves the other active', async () => {
    const phone = '918000000913';
    User.createUser({ name: 'T', phone });
    await apiRouter.processPaymentEvent(evt('subscription.activated', { phone, plan: 'auraplus' }));
    await apiRouter.processPaymentEvent(evt('subscription.cancelled', { phone, plan: 'lookmaxxing' }));
    const u = User.getUserByPhone(phone);
    expect(u.oratorActive).toBe(true);
    expect(u.lookmaxxingActive).toBe(false);
    expect(u.subscriptionStatus).not.toBe('cancelled'); // still has Orator
  });

  it('cancelling the last pillar marks the subscription cancelled', async () => {
    const phone = '918000000914';
    User.createUser({ name: 'U', phone });
    await apiRouter.processPaymentEvent(evt('subscription.activated', { phone, plan: 'lookmaxxing' }));
    await apiRouter.processPaymentEvent(evt('subscription.cancelled', { phone, plan: 'lookmaxxing' }));
    const u = User.getUserByPhone(phone);
    expect(u.lookmaxxingActive).toBe(false);
    expect(u.subscriptionStatus).toBe('cancelled');
  });
});
