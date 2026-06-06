/**
 * tests/payment-verify.test.js — webhook-independent return verification.
 * /pay/verify (₹99 subscription) + /tokens/verify (token pack), with signature
 * checks and idempotency. Razorpay HMAC uses a test secret set before import.
 */
import { describe, it, expect, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-payverify-'));
process.env.AUDIT_V2_STORE_PATH = path.join(tmpDir, 'audit.json');
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
const SECRET = 'test_secret_verify';
process.env.RAZORPAY_KEY_SECRET = SECRET;
process.env.RAZORPAY_KEY_ID = 'rzp_test_verify'; // not live → fine; verify uses the secret

const subSig = (pid, sid) => crypto.createHmac('sha256', SECRET).update(pid + '|' + sid).digest('hex');
const paySig = (oid, pid) => crypto.createHmac('sha256', SECRET).update(oid + '|' + pid).digest('hex');

const request = (await import('supertest')).default;
const express = (await import('express')).default;
const lookmaxing = (await import('../routes/lookmaxing.js')).default;
const tokens = (await import('../routes/tokens.js')).default;
const User = (await import('../models/User.js')).default;
const { makeSession } = await import('./helpers/lookmax-session.js');

const app = express();
app.use(express.json());
app.use('/api/lookmaxing', lookmaxing);
app.use('/api/lookmax/tokens', tokens);
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

async function newAudit(bearer) {
  const q = await request(app).post('/api/lookmaxing/quiz').set('Authorization', bearer).send({
    answers: [{ questionId: 'q1', choice: 'A', label: 'A' }, { questionId: 'q2', choice: 'B', label: 'B' },
      { questionId: 'q3', choice: 'A', label: 'A' }, { questionId: 'q4', choice: 'B', label: 'B' }, { questionId: 'q5', choice: 'A', label: 'A' }],
  });
  return q.body.auditId;
}

describe('POST /api/lookmaxing/pay/verify', () => {
  it('unlocks the report on a valid subscription signature', async () => {
    const { bearer, user } = await makeSession();
    const auditId = await newAudit(bearer);
    const pid = 'pay_abc', sid = 'sub_abc';
    const res = await request(app).post('/api/lookmaxing/pay/verify').set('Authorization', bearer)
      .send({ auditId, razorpay_payment_id: pid, razorpay_subscription_id: sid, razorpay_signature: subSig(pid, sid) });
    expect(res.status).toBe(200);
    expect(res.body.paid).toBe(true);
    expect((await User.getUserByToken(user.token)).lookmaxxingActive).toBe(true);
  });
  it('rejects a bad signature', async () => {
    const { bearer } = await makeSession();
    const auditId = await newAudit(bearer);
    const res = await request(app).post('/api/lookmaxing/pay/verify').set('Authorization', bearer)
      .send({ auditId, razorpay_payment_id: 'p', razorpay_subscription_id: 's', razorpay_signature: 'WRONG' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/lookmax/tokens/verify', () => {
  it('credits the pack on a valid signature, and is idempotent', async () => {
    const { bearer, user } = await makeSession();
    const oid = 'order_1', pid = 'pay_1';
    const body = { pack: 'starter', razorpay_order_id: oid, razorpay_payment_id: pid, razorpay_signature: paySig(oid, pid) };
    const r1 = await request(app).post('/api/lookmax/tokens/verify').set('Authorization', bearer).send(body);
    expect(r1.status).toBe(200);
    expect(r1.body.tokens).toBe(50);
    // Same payment again → no double-credit.
    const r2 = await request(app).post('/api/lookmax/tokens/verify').set('Authorization', bearer).send(body);
    expect(r2.body.added).toBe(0);
    expect((await User.getUserByToken(user.token)).tokens).toBe(50);
  });
  it('rejects a bad signature', async () => {
    const { bearer } = await makeSession();
    const res = await request(app).post('/api/lookmax/tokens/verify').set('Authorization', bearer)
      .send({ pack: 'starter', razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 'WRONG' });
    expect(res.status).toBe(400);
  });
});
