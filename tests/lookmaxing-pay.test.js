/**
 * tests/lookmaxing-pay.test.js
 * Tests Razorpay order creation + webhook signature verify + paid-flip.
 * Razorpay is mocked (no live API calls).
 * Cited spec: briefs/stage-1-audit-spec.md §8 (Razorpay test-mode), §D.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lmx-pay-'));
process.env.AUDIT_V2_STORE_PATH = path.join(tmpDir, 'audit-v2.json');
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.EVENTS_BACKEND = 'file';
process.env.EVENTS_JSONL_PATH = path.join(tmpDir, 'events.jsonl');
process.env.JWT_SECRET = 'test-jwt-secret';
// Use a test webhook secret so we can construct valid signatures.
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_lookmaxing';

const request = (await import('supertest')).default;
const express = (await import('express')).default;
const lookmaxingRouter = (await import('../routes/lookmaxing.js')).default;
const { makeSession } = await import('./helpers/lookmax-session.js');

const app = express();
// Must capture raw body for signature verification (mirrors server.js).
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use('/api/lookmaxing', lookmaxingRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

/** Build a valid Razorpay webhook signature for a raw body. */
function razorpaySign(rawBody, secret = 'test_webhook_secret_lookmaxing') {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

describe('Lookmaxing payment flow', () => {
  let bearer;
  let auditId;

  beforeAll(async () => {
    // Sign in + create audit session (guest flow removed — funnel-repair P1)
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

  describe('POST /api/lookmaxing/pay/order', () => {
    it('returns an order object with amount 9900', async () => {
      const res = await request(app)
        .post('/api/lookmaxing/pay/order')
        .set('Authorization', bearer)
        .send({ auditId });
      expect(res.status).toBe(200);
      expect(res.body.amount).toBe(9900);
      expect(res.body.currency).toBe('INR');
      expect(res.body.orderId).toBeTruthy();
      // key_id is returned for client-side Razorpay.open()
      expect(res.body).toHaveProperty('keyId');
    });

    it('returns 400 when auditId is missing', async () => {
      const res = await request(app)
        .post('/api/lookmaxing/pay/order')
        .set('Authorization', bearer)
        .send({});
      expect(res.status).toBe(400);
    });

    it('returns 404 when auditId does not exist', async () => {
      const res = await request(app)
        .post('/api/lookmaxing/pay/order')
        .set('Authorization', bearer)
        .send({ auditId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/lookmaxing/pay/webhook', () => {
    it('flips paid=true on payment.captured event with valid signature', async () => {
      const payload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: 'pay_test_abc123',
              notes: { auditId },
            },
          },
        },
      });
      const sig = razorpaySign(payload);

      const res = await request(app)
        .post('/api/lookmaxing/pay/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', sig)
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verify the audit is now paid
      const auditRes = await request(app)
        .get(`/api/lookmaxing/audit/${auditId}`)
        .set('Authorization', bearer);
      expect(auditRes.body.paid).toBe(true);
    });

    it('rejects webhook with invalid signature', async () => {
      const payload = JSON.stringify({ event: 'payment.captured' });
      const res = await request(app)
        .post('/api/lookmaxing/pay/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', 'bad_signature')
        .send(payload);
      expect(res.status).toBe(401);
    });

    it('ignores non-payment.captured events', async () => {
      const payload = JSON.stringify({
        event: 'payment.failed',
        payload: { payment: { entity: { id: 'pay_fail_999', notes: { auditId } } } },
      });
      const sig = razorpaySign(payload);
      const res = await request(app)
        .post('/api/lookmaxing/pay/webhook')
        .set('Content-Type', 'application/json')
        .set('x-razorpay-signature', sig)
        .send(payload);
      expect(res.status).toBe(200);
      expect(res.body.ignored).toBe(true);
    });
  });
});
