/**
 * tests/lookmaxing-referral-pay.test.js
 *
 * Tests for:
 *   - POST /api/lookmaxing/pay/validate-code (read-only price check)
 *   - POST /api/lookmaxing/pay/order with optional referral code
 *   - inrPaiseToUsd helper export
 *   - Referral code redemption on _settlePaidAudit (settlement integration)
 *
 * Razorpay is mocked (bypass mode, no live keys). Referral code model uses
 * a temp dir isolated from real data.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lmx-refpay-'));
process.env.AUDIT_V2_STORE_PATH      = path.join(tmpDir, 'audit-v2.json');
process.env.USERS_FILE_PATH          = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH       = path.join(tmpDir, 'waitlist.json');
process.env.EVENTS_BACKEND          = 'file';
process.env.EVENTS_JSONL_PATH       = path.join(tmpDir, 'events.jsonl');
process.env.JWT_SECRET              = 'test-jwt-secret-refpay';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_refpay';
process.env.REFERRAL_CODES_FILE_PATH = path.join(tmpDir, 'referral-codes.json');

const request          = (await import('supertest')).default;
const express          = (await import('express')).default;
const lookmaxingRouter = (await import('../routes/lookmaxing.js')).default;
const { makeSession }  = await import('./helpers/lookmax-session.js');
const ReferralCodes    = (await import('../models/referral-codes.js')).default
  || (await import('../models/referral-codes.js'));
const { inrPaiseToUsd } = await import('../services/razorpay.js');

const app = express();
app.use(
  express.json({
    verify: (req, _res, buf) => { req.rawBody = buf; },
  })
);
app.use('/api/lookmaxing', lookmaxingRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

/** Build a valid Razorpay webhook signature for a raw body. */
function razorpaySign(rawBody, secret = 'test_webhook_secret_refpay') {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

// ── inrPaiseToUsd ─────────────────────────────────────────────────────────────

describe('inrPaiseToUsd helper', () => {
  it('converts 49900 paise to ~$5.99 (default rate)', () => {
    const usd = inrPaiseToUsd(49900);
    expect(usd).toMatch(/^\$[\d.]+$/);
    // At the default rate (83.3 INR/USD): 499 / 83.3 ≈ 5.99
    const val = parseFloat(usd.slice(1));
    expect(val).toBeGreaterThanOrEqual(5.5);
    expect(val).toBeLessThanOrEqual(6.5);
  });

  it('enforces the $0.99 minimum for very small amounts', () => {
    // 10 paise = ₹0.10 — far below the minimum
    const usd = inrPaiseToUsd(10);
    expect(parseFloat(usd.slice(1))).toBe(0.99);
  });

  it('returns a string starting with $', () => {
    expect(inrPaiseToUsd(9900)).toMatch(/^\$/);
    expect(inrPaiseToUsd(49900)).toMatch(/^\$/);
  });
});

// ── Shared test session ───────────────────────────────────────────────────────

let bearer;
let auditId;

beforeAll(async () => {
  ({ bearer } = await makeSession());
  const quizRes = await request(app)
    .post('/api/lookmaxing/quiz')
    .set('Authorization', bearer)
    .send({
      answers: [
        { questionId: 'q1', choice: 'A', label: 'Powerful.' },
        { questionId: 'q2', choice: 'C', label: 'Oily.' },
        { questionId: 'q3', choice: 'A', label: 'Thick.' },
        { questionId: 'q4', choice: 'B', label: 'Six hours.' },
        { questionId: 'q5', choice: 'B', label: 'Basic routine.' },
      ],
    });
  auditId = quizRes.body.auditId;
});

// ── POST /pay/validate-code ───────────────────────────────────────────────────

describe('POST /api/lookmaxing/pay/validate-code', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/pay/validate-code')
      .send({ code: 'ANYCODE1' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when code is missing from body', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/pay/validate-code')
      .set('Authorization', bearer)
      .send({});
    expect(res.status).toBe(400);
  });

  it('returns valid:false with baseInr/baseUsd for an unknown code', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/pay/validate-code')
      .set('Authorization', bearer)
      .send({ code: 'NOTEXIST' });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toBeTruthy();
    expect(res.body.baseInr).toBe(499);
    expect(res.body.baseUsd).toMatch(/^\$/);
  });

  it('returns valid:true with discounted amounts for a valid code', async () => {
    const rec = ReferralCodes.createCode({ percentOff: 20, maxUses: 5 });
    const res = await request(app)
      .post('/api/lookmaxing/pay/validate-code')
      .set('Authorization', bearer)
      .send({ code: rec.code });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.percentOff).toBe(20);
    expect(res.body.baseInr).toBe(499);
    expect(res.body.baseUsd).toMatch(/^\$/);
    // 49900 * (1 - 0.20) = 39920 paise → ₹399.20
    expect(res.body.discountedPaise).toBe(39920);
    expect(res.body.discountedInr).toBe(399.2);
    expect(res.body.discountedUsd).toMatch(/^\$/);
  });

  it('returns valid:false for an exhausted code (does not redeem)', async () => {
    const rec = ReferralCodes.createCode({ percentOff: 10, maxUses: 1 });
    // Exhaust it
    ReferralCodes.redeemCode(rec.code);

    const res = await request(app)
      .post('/api/lookmaxing/pay/validate-code')
      .set('Authorization', bearer)
      .send({ code: rec.code });
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(false);
    expect(res.body.reason).toBeTruthy();
    // Uses should still be 1 (not 2) — validate-code does NOT redeem
    const afterCheck = ReferralCodes.getCode(rec.code);
    expect(afterCheck.uses).toBe(1);
  });
});

// ── POST /pay/order with referral code ───────────────────────────────────────

describe('POST /api/lookmaxing/pay/order — referral code integration', () => {
  it('uses base amount 49900 when no code supplied', async () => {
    const res = await request(app)
      .post('/api/lookmaxing/pay/order')
      .set('Authorization', bearer)
      .send({ auditId });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(49900);
    expect(typeof res.body.usd).toBe('string');
    expect(res.body.usd).toMatch(/^\$/);
    // No referral applied
    expect(res.body.referralApplied).toBeFalsy();
  });

  it('applies discount when a valid referral code is supplied', async () => {
    const rec = ReferralCodes.createCode({ percentOff: 50, maxUses: 5 });

    // Need a fresh audit to avoid alreadyPaid short-circuit
    const quizRes2 = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Authorization', bearer)
      .send({
        answers: [
          { questionId: 'q1', choice: 'A', label: 'Powerful.' },
          { questionId: 'q2', choice: 'C', label: 'Oily.' },
          { questionId: 'q3', choice: 'A', label: 'Thick.' },
          { questionId: 'q4', choice: 'B', label: 'Six hours.' },
          { questionId: 'q5', choice: 'B', label: 'Basic routine.' },
        ],
      });
    const auditId2 = quizRes2.body.auditId;

    const res = await request(app)
      .post('/api/lookmaxing/pay/order')
      .set('Authorization', bearer)
      .send({ auditId: auditId2, code: rec.code });

    expect(res.status).toBe(200);
    // 49900 * 0.50 = 24950 paise
    expect(res.body.amount).toBe(24950);
    expect(res.body.referralApplied).toBe(true);
    expect(res.body.percentOff).toBe(50);
    expect(typeof res.body.usd).toBe('string');
  });

  it('returns 400 for an invalid referral code', async () => {
    const quizRes3 = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Authorization', bearer)
      .send({
        answers: [
          { questionId: 'q1', choice: 'A', label: 'Powerful.' },
          { questionId: 'q2', choice: 'C', label: 'Oily.' },
          { questionId: 'q3', choice: 'A', label: 'Thick.' },
          { questionId: 'q4', choice: 'B', label: 'Six hours.' },
          { questionId: 'q5', choice: 'B', label: 'Basic routine.' },
        ],
      });
    const auditId3 = quizRes3.body.auditId;

    const res = await request(app)
      .post('/api/lookmaxing/pay/order')
      .set('Authorization', bearer)
      .send({ auditId: auditId3, code: 'BADCODE9' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_code');
    expect(res.body.reason).toBeTruthy();
  });

  it('returns 400 for an exhausted referral code', async () => {
    const rec = ReferralCodes.createCode({ percentOff: 30, maxUses: 1 });
    ReferralCodes.redeemCode(rec.code); // exhaust it

    const quizRes4 = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Authorization', bearer)
      .send({
        answers: [
          { questionId: 'q1', choice: 'A', label: 'Powerful.' },
          { questionId: 'q2', choice: 'C', label: 'Oily.' },
          { questionId: 'q3', choice: 'A', label: 'Thick.' },
          { questionId: 'q4', choice: 'B', label: 'Six hours.' },
          { questionId: 'q5', choice: 'B', label: 'Basic routine.' },
        ],
      });
    const auditId4 = quizRes4.body.auditId;

    const res = await request(app)
      .post('/api/lookmaxing/pay/order')
      .set('Authorization', bearer)
      .send({ auditId: auditId4, code: rec.code });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_code');
  });
});

// ── Referral code redemption on settlement (via webhook) ──────────────────────

describe('Referral code redeemed on settlement (pay/webhook)', () => {
  it('redeems the pending referral code exactly once on payment.captured', async () => {
    const rec = ReferralCodes.createCode({ percentOff: 25, maxUses: 1 });

    // Create a fresh audit session
    const quizRes5 = await request(app)
      .post('/api/lookmaxing/quiz')
      .set('Authorization', bearer)
      .send({
        answers: [
          { questionId: 'q1', choice: 'A', label: 'Powerful.' },
          { questionId: 'q2', choice: 'C', label: 'Oily.' },
          { questionId: 'q3', choice: 'A', label: 'Thick.' },
          { questionId: 'q4', choice: 'B', label: 'Six hours.' },
          { questionId: 'q5', choice: 'B', label: 'Basic routine.' },
        ],
      });
    const auditId5 = quizRes5.body.auditId;

    // Place an order with the referral code (stores pendingReferralCode on session)
    const orderRes = await request(app)
      .post('/api/lookmaxing/pay/order')
      .set('Authorization', bearer)
      .send({ auditId: auditId5, code: rec.code });
    expect(orderRes.status).toBe(200);
    expect(orderRes.body.amount).toBe(37425); // 49900 * 0.75 = 37425

    // Simulate Razorpay webhook — should redeem the code and flip paid
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_refpay_test_123',
            notes: { auditId: auditId5 },
          },
        },
      },
    });
    const sig = razorpaySign(payload);

    const webhookRes = await request(app)
      .post('/api/lookmaxing/pay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig)
      .send(payload);
    expect(webhookRes.status).toBe(200);
    expect(webhookRes.body.ok).toBe(true);

    // Verify: code uses incremented to 1
    const updatedCode = ReferralCodes.getCode(rec.code);
    expect(updatedCode.uses).toBe(1);

    // Verify: second settlement call does NOT double-redeem
    // (session.paid guard in _settlePaidAudit prevents re-entry)
    const payload2 = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_refpay_test_456',
            notes: { auditId: auditId5 },
          },
        },
      },
    });
    const sig2 = razorpaySign(payload2);
    await request(app)
      .post('/api/lookmaxing/pay/webhook')
      .set('Content-Type', 'application/json')
      .set('x-razorpay-signature', sig2)
      .send(payload2);

    // Uses must still be 1 — no double-redeem
    const codeAfterDouble = ReferralCodes.getCode(rec.code);
    expect(codeAfterDouble.uses).toBe(1);
  });
});
