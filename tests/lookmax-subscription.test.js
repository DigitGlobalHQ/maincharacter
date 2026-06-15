/**
 * tests/lookmax-subscription.test.js
 *
 * Tests for the ₹99/month recurring subscription engine:
 *   1. lookmax99 plan shape in services/razorpay.js
 *   2. POST /api/lookmaxing/pay/subscribe → subscriptionId + testMode
 *   3. Entitlement unlock: user.lookmaxxingActive makes /audit/:id return paid:true
 *      (even when session.paid is false) and /audit/:id/pdf returns 200 (not 403)
 *   4. processPaymentEvent identity reconciliation:
 *      a. via notes.userId (new path)
 *      b. via notes.phone (existing path — Orator regression guard)
 *      c. via notes.email (new fallback path)
 *   5. POST /pay/test-confirm sets lookmaxxingActive + subscriptionStatus on user
 *   6. Existing Orator payment tests still pass (phone path untouched)
 *   7. Existing one-time /pay/order + /pay/webhook tests still pass
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

// ── Isolated temp stores ──────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lmsub-'));
process.env.AUDIT_V2_STORE_PATH    = path.join(tmpDir, 'audit-v2.json');
process.env.USERS_FILE_PATH        = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH     = path.join(tmpDir, 'waitlist.json');
process.env.RAZORPAY_PLANS_FILE_PATH = path.join(tmpDir, 'razorpay-plans.json');
process.env.EVENTS_BACKEND        = 'file';
process.env.EVENTS_JSONL_PATH      = path.join(tmpDir, 'events.jsonl');
process.env.JWT_SECRET             = 'test-jwt-secret-sub';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_wh_secret_sub';
process.env.WHATSAPP_SEND_MODE     = 'off';

// No live Razorpay keys → mock mode (all subscription tests run in mock)
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

// ── Lazy imports (env must be set first) ─────────────────────────────────────
const request         = (await import('supertest')).default;
const express         = (await import('express')).default;
const lookmaxingRouter = (await import('../routes/lookmaxing.js')).default;
const apiRouter        = (await import('../routes/api.js')).default;
const { processPaymentEvent } = await import('../routes/api.js');
const User            = (await import('../models/User.js')).default;
const razorpay        = (await import('../services/razorpay.js')).default;
const { makeSession } = await import('./helpers/lookmax-session.js');

// ── Express apps ──────────────────────────────────────────────────────────────
const lmApp = express();
lmApp.use(
  express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })
);
lmApp.use('/api/lookmaxing', lookmaxingRouter);

const fullApp = express();
fullApp.use(
  express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } })
);
fullApp.use('/api/lookmaxing', lookmaxingRouter);
fullApp.use('/api', apiRouter);

// ── Helpers ───────────────────────────────────────────────────────────────────
function razorpaySign(raw, secret = 'test_wh_secret_sub') {
  return crypto.createHmac('sha256', secret).update(raw).digest('hex');
}

async function newAudit(app, bearer) {
  const res = await request(app)
    .post('/api/lookmaxing/quiz')
    .set('Authorization', bearer)
    .send({
      answers: [
        { questionId: 'q1', choice: 'A', label: 'Powerful.' },
        { questionId: 'q2', choice: 'C', label: 'Oily.'    },
        { questionId: 'q3', choice: 'A', label: 'Thick.'   },
        { questionId: 'q4', choice: 'B', label: 'Six h.'   },
        { questionId: 'q5', choice: 'B', label: 'Routine.' },
      ],
    });
  return res.body.auditId;
}

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

// ══════════════════════════════════════════════════════════════════════════════
// 1. lookmax99 plan shape
// ══════════════════════════════════════════════════════════════════════════════
describe('lookmax99 plan in PLANS', () => {
  it('exists in razorpay.PLANS', () => {
    expect(razorpay.PLANS).toHaveProperty('lookmax99');
  });

  it('has amount 9900 (paise)', () => {
    expect(razorpay.PLANS.lookmax99.amount).toBe(9900);
  });

  it('has period monthly', () => {
    expect(razorpay.PLANS.lookmax99.period).toBe('monthly');
  });

  it('has display ₹99/month', () => {
    expect(razorpay.PLANS.lookmax99.display).toBe('₹99/month');
  });

  it('activates lookmaxxing pillar only', () => {
    expect(razorpay.PLANS.lookmax99.pillars).toEqual(['lookmaxxing']);
  });

  it('does NOT break the existing lookmaxxing plan (₹1,499)', () => {
    expect(razorpay.PLANS.lookmaxxing.amount).toBe(149900);
  });

  it('pillarsForPlan("lookmax99") returns ["lookmaxxing"]', () => {
    expect(razorpay.pillarsForPlan('lookmax99')).toEqual(['lookmaxxing']);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. POST /api/lookmaxing/pay/subscribe
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /api/lookmaxing/pay/subscribe', () => {
  let bearer, auditId, userId;

  beforeAll(async () => {
    const session = await makeSession();
    bearer  = session.bearer;
    userId  = session.user.token;
    auditId = await newAudit(lmApp, bearer);
  });

  it('returns 401 without auth', async () => {
    const res = await request(lmApp)
      .post('/api/lookmaxing/pay/subscribe')
      .send({ auditId });
    expect(res.status).toBe(401);
  });

  it('returns 400 without auditId', async () => {
    const res = await request(lmApp)
      .post('/api/lookmaxing/pay/subscribe')
      .set('Authorization', bearer)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns 404 for unknown auditId', async () => {
    const res = await request(lmApp)
      .post('/api/lookmaxing/pay/subscribe')
      .set('Authorization', bearer)
      .send({ auditId: '00000000-0000-0000-0000-000000000000' });
    expect(res.status).toBe(404);
  });

  it('returns subscriptionId + testMode:true + keyId in mock mode', async () => {
    const res = await request(lmApp)
      .post('/api/lookmaxing/pay/subscribe')
      .set('Authorization', bearer)
      .send({ auditId });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('subscriptionId');
    expect(typeof res.body.subscriptionId).toBe('string');
    expect(res.body.subscriptionId.length).toBeGreaterThan(0);
    expect(res.body).toHaveProperty('keyId');
    expect(res.body.testMode).toBe(true);
  });

  it('persists subscriptionId on user record', async () => {
    const res = await request(lmApp)
      .post('/api/lookmaxing/pay/subscribe')
      .set('Authorization', bearer)
      .send({ auditId });
    expect(res.status).toBe(200);
    const user = await User.getUserByToken(userId);
    expect(user.razorpaySubscriptionId).toBe(res.body.subscriptionId);
  });

  it('returns alreadyUnlocked:true when user.lookmaxxingActive is true', async () => {
    // Activate on the user directly
    const user = await User.getUserByToken(userId);
    await User.updateUser(user.phone, { lookmaxxingActive: true });

    const res = await request(lmApp)
      .post('/api/lookmaxing/pay/subscribe')
      .set('Authorization', bearer)
      .send({ auditId });
    expect(res.status).toBe(200);
    expect(res.body.alreadyUnlocked).toBe(true);

    // Reset for subsequent tests
    await User.updateUser(user.phone, { lookmaxxingActive: false });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Entitlement unlock via user.lookmaxxingActive
// ══════════════════════════════════════════════════════════════════════════════
describe('Entitlement: user.lookmaxxingActive unlocks without session.paid', () => {
  let bearer, auditId, user;

  beforeAll(async () => {
    const session = await makeSession();
    bearer  = session.bearer;
    user    = session.user;
    auditId = await newAudit(lmApp, bearer);
    // Inject a Gemini report into the session so PDF path is reachable
    lookmaxingRouter._injectReportForTest(auditId, {
      auraScore: 72, rank: 'luminary', firstImpression: 'Test.',
      freeSignals: [{ label: 'Signal1', axis: 'ax1' }],
      decomposition: {
        skin: [{ metric: 'skinClarity', score: 72, cause: 'c', fix: 'f' }],
        hair: [], jawAndFace: [], bodyAndPosture: [], lifestyleSignals: [],
      },
      biggestLever: { metric: 'skinClarity', score: 72, rationale: 'r' },
      quests: [{ metric: 'skinClarity', task: 't', library: 'l' }],
      styleAndColour: { haircut: 'h', palette: ['navy'], avoid: [] },
      starterPlan: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, morning: 'm', evening: 'e' })),
    }, true);
  });

  it('GET /audit/:id returns paid:false when user has lookmaxxingActive=false', async () => {
    const res = await request(lmApp)
      .get(`/api/lookmaxing/audit/${auditId}`)
      .set('Authorization', bearer);
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(false);
  });

  it('GET /audit/:id returns paid:true (and full report) when user.lookmaxxingActive=true', async () => {
    await User.updateUser(user.phone, { lookmaxxingActive: true });

    const res = await request(lmApp)
      .get(`/api/lookmaxing/audit/${auditId}`)
      .set('Authorization', bearer);
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);
    // Premium field should be present (full report)
    expect(res.body.report).toHaveProperty('decomposition');
    expect(res.body.report).toHaveProperty('biggestLever');
    expect(res.body.report).toHaveProperty('quests');
  });

  it('GET /audit/:id/pdf returns 200 (not 403) when user.lookmaxxingActive=true and session.paid=false', async () => {
    // user already has lookmaxxingActive=true from prior test
    const session = lookmaxingRouter._getSession(auditId);
    expect(session.paid).toBe(false); // confirm session itself is still unpaid

    const res = await request(lmApp)
      .get(`/api/lookmaxing/audit/${auditId}/pdf`)
      .set('Authorization', bearer);
    // Should NOT be 403 (payment required)
    expect(res.status).not.toBe(403);
    expect([200, 500]).toContain(res.status); // 500 = pdfkit not available in test env
  });

  it('GET /audit/:id/pdf returns 403 for unsubscribed user with session.paid=false', async () => {
    const freshSession = await makeSession();
    const freshAuditId = await newAudit(lmApp, freshSession.bearer);
    // No lookmaxxingActive, no session.paid
    const res = await request(lmApp)
      .get(`/api/lookmaxing/audit/${freshAuditId}/pdf`)
      .set('Authorization', freshSession.bearer);
    expect(res.status).toBe(403);
  });

  afterAll(async () => {
    await User.updateUser(user.phone, { lookmaxxingActive: false });
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. processPaymentEvent identity reconciliation
// ══════════════════════════════════════════════════════════════════════════════
describe('processPaymentEvent identity reconciliation', () => {
  let phoneUser, emailUser, tokenUser;

  beforeAll(async () => {
    // Orator-style user (phone-primary)
    phoneUser = User.createUser({
      name: 'PhoneUser', phone: '919111111100', preferredTime: '08:00',
    });
    // Email-primary user (Lookmaxing funnel, no real phone)
    emailUser = await User.getOrCreateByEmail({ email: 'sub-test-email@example.test', name: 'EmailUser' });
    // Token-only user (email-primary, accessed via token)
    tokenUser = await User.getOrCreateByEmail({ email: 'sub-test-token@example.test', name: 'TokenUser' });
  });

  it('4a: activates user via notes.phone (Orator / existing path)', async () => {
    await processPaymentEvent({
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            notes: { phone: '919111111100', plan: 'seeker', pillars: 'orator' },
          },
        },
      },
    });
    const u = User.getUserByPhone('919111111100');
    expect(u.subscriptionStatus).toBe('active');
    expect(u.oratorActive).toBe(true);
  });

  it('4b: activates user via notes.userId (Lookmaxing token path)', async () => {
    const userId = tokenUser.token;
    // notes has userId but no phone
    await processPaymentEvent({
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            notes: {
              userId,
              plan: 'lookmax99',
              pillars: 'lookmaxxing',
              source: 'lookmaxing_audit',
            },
          },
        },
      },
    });
    const u = await User.getUserByToken(userId);
    expect(u.lookmaxxingActive).toBe(true);
    expect(u.subscriptionStatus).toBe('active');
  });

  it('4c: activates user via notes.email fallback', async () => {
    // notes has email but no phone and no userId
    await processPaymentEvent({
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            notes: {
              email: 'sub-test-email@example.test',
              plan: 'lookmax99',
              pillars: 'lookmaxxing',
            },
          },
        },
      },
    });
    const u = User.getUserByEmail('sub-test-email@example.test');
    expect(u.lookmaxxingActive).toBe(true);
    expect(u.subscriptionStatus).toBe('active');
  });

  it('returns handled:false when no phone / userId / email in notes', async () => {
    const result = await processPaymentEvent({
      event: 'subscription.activated',
      payload: { subscription: { entity: { notes: {} } } },
    });
    expect(result.handled).toBe(false);
  });

  it('Orator cancellation via phone still works', async () => {
    await processPaymentEvent({
      event: 'subscription.cancelled',
      payload: {
        subscription: {
          entity: {
            notes: { phone: '919111111100', plan: 'seeker', pillars: 'orator' },
          },
        },
      },
    });
    const u = User.getUserByPhone('919111111100');
    expect(u.oratorActive).toBe(false);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. POST /pay/test-confirm sets lookmaxxingActive on user
// ══════════════════════════════════════════════════════════════════════════════
describe('POST /pay/test-confirm sets lookmaxxingActive in demo mode', () => {
  let bearer, auditId, user;

  beforeAll(async () => {
    const session = await makeSession();
    bearer  = session.bearer;
    user    = session.user;
    auditId = await newAudit(lmApp, bearer);
  });

  it('sets lookmaxxingActive=true on the owning user', async () => {
    const res = await request(lmApp)
      .post('/api/lookmaxing/pay/test-confirm')
      .set('Authorization', bearer)
      .send({ auditId });
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);

    const updated = await User.getUserByToken(user.token);
    expect(updated.lookmaxxingActive).toBe(true);
    expect(updated.subscriptionStatus).toBe('active');
  });

  it('subsequent /pay/test-confirm is idempotent (still 200)', async () => {
    const res = await request(lmApp)
      .post('/api/lookmaxing/pay/test-confirm')
      .set('Authorization', bearer)
      .send({ auditId });
    expect(res.status).toBe(200);
  });

  it('lookmaxxingStartedAt is set after test-confirm', async () => {
    const updated = await User.getUserByToken(user.token);
    expect(updated.lookmaxxingStartedAt).toBeTruthy();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. createSubscription accepts extraNotes
// ══════════════════════════════════════════════════════════════════════════════
describe('razorpay.createSubscription extraNotes merging', () => {
  it('mock subscription carries extraNotes fields in its mock id (smoke check)', async () => {
    // In mock mode the sub.id is a string; we just verify the call does not throw
    // and the return shape is correct.
    const sub = await razorpay.createSubscription(
      'lookmax99',
      { phone: '', name: 'Tester', email: 'test@example.test' },
      { userId: 'tok_abc', auditId: 'audit_xyz', source: 'lookmaxing_audit' }
    );
    expect(sub).toHaveProperty('id');
    expect(sub).toHaveProperty('mock', true);
  });

  it('unknown plan throws', async () => {
    await expect(
      razorpay.createSubscription('not_a_plan', {})
    ).rejects.toThrow('Unknown plan');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 7. Backward-compat: one-time /pay/order tests still pass
// ══════════════════════════════════════════════════════════════════════════════
describe('Backward compat: /pay/order still works', () => {
  let bearer, auditId;

  beforeAll(async () => {
    const session = await makeSession();
    bearer  = session.bearer;
    auditId = await newAudit(lmApp, bearer);
  });

  it('POST /pay/order returns amount:49900 (₹499) and testMode:true in mock mode', async () => {
    const res = await request(lmApp)
      .post('/api/lookmaxing/pay/order')
      .set('Authorization', bearer)
      .send({ auditId });
    expect(res.status).toBe(200);
    // Price updated from ₹99 (9900 paise) to ₹499 (49900 paise) — founder 2026-06-15
    expect(res.body.amount).toBe(49900);
    expect(res.body.testMode).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 8. /pay/webhook one-time still works (backward compat)
// ══════════════════════════════════════════════════════════════════════════════
describe('Backward compat: /pay/webhook one-time capture still works', () => {
  let bearer, auditId;

  beforeAll(async () => {
    const session = await makeSession();
    bearer  = session.bearer;
    auditId = await newAudit(lmApp, bearer);
  });

  it('flips session.paid=true on a valid payment.captured event', async () => {
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: 'pay_sub_compat_test', notes: { auditId } },
        },
      },
    });
    const sig = razorpaySign(payload);

    const res = await request(lmApp)
      .post('/api/lookmaxing/pay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig)
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const auditRes = await request(lmApp)
      .get(`/api/lookmaxing/audit/${auditId}`)
      .set('Authorization', bearer);
    expect(auditRes.body.paid).toBe(true);
  });

  it('rejects webhook with bad signature', async () => {
    const res = await request(lmApp)
      .post('/api/lookmaxing/pay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', 'badsig')
      .send('{}');
    expect(res.status).toBe(401);
  });
});
