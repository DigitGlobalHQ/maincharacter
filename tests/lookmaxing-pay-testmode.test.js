/**
 * tests/lookmaxing-pay-testmode.test.js
 * Demo-mode ₹99 unlock: lets the full report + PDF be experienced before live
 * Razorpay keys exist, and is HARD-DISABLED the instant live keys are set.
 * Cited: founder directive (pre-go-live demo window).
 */
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lmx-paytm-'));
process.env.AUDIT_V2_STORE_PATH = path.join(tmpDir, 'audit-v2.json');
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.EVENTS_BACKEND = 'file';
process.env.EVENTS_JSONL_PATH = path.join(tmpDir, 'events.jsonl');
process.env.JWT_SECRET = 'test-jwt-secret';
// Ensure demo mode: no live Razorpay keys.
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

const request = (await import('supertest')).default;
const express = (await import('express')).default;
const lookmaxingRouter = (await import('../routes/lookmaxing.js')).default;
const { makeSession } = await import('./helpers/lookmax-session.js');

const app = express();
app.use(express.json());
app.use('/api/lookmaxing', lookmaxingRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

async function newAudit(bearer) {
  const quiz = await request(app)
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
  return quiz.body.auditId;
}

describe('Demo-mode ₹99 unlock', () => {
  let bearer; let auditId;
  beforeAll(async () => { ({ bearer } = await makeSession()); auditId = await newAudit(bearer); });

  it('/pay/order flags testMode:true when no live keys are configured', async () => {
    const res = await request(app).post('/api/lookmaxing/pay/order').set('Authorization', bearer).send({ auditId });
    expect(res.status).toBe(200);
    expect(res.body.testMode).toBe(true);
    expect(res.body.amount).toBe(9900);
  });

  it('/pay/test-confirm settles the unlock so the full report opens', async () => {
    const res = await request(app).post('/api/lookmaxing/pay/test-confirm').set('Authorization', bearer).send({ auditId });
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);
    const audit = await request(app).get(`/api/lookmaxing/audit/${auditId}`).set('Authorization', bearer);
    expect(audit.body.paid).toBe(true);
  });

  it('rejects /pay/test-confirm without auth', async () => {
    const res = await request(app).post('/api/lookmaxing/pay/test-confirm').send({ auditId });
    expect(res.status).toBe(401);
  });

  it('is HARD-DISABLED (403) the moment live Razorpay keys are configured', async () => {
    process.env.RAZORPAY_KEY_ID = 'rzp_live_demoguard';
    process.env.RAZORPAY_KEY_SECRET = 'secret_demoguard';
    try {
      const fresh = await newAudit(bearer);
      const res = await request(app).post('/api/lookmaxing/pay/test-confirm').set('Authorization', bearer).send({ auditId: fresh });
      expect(res.status).toBe(403);
      // and /pay/order no longer flags testMode
      // (order create will try the real Razorpay SDK; we only assert the guard above)
    } finally {
      delete process.env.RAZORPAY_KEY_ID;
      delete process.env.RAZORPAY_KEY_SECRET;
    }
  });
});
