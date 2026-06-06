/**
 * tests/tokens.test.js — token/credits system (balance, buy-bypass, spend, webhook credit).
 */
import { describe, it, expect, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-tokens-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
delete process.env.RAZORPAY_KEY_ID; // bypass mode

const request = (await import('supertest')).default;
const express = (await import('express')).default;
const tokensRouter = (await import('../routes/tokens.js')).default;
const User = (await import('../models/User.js')).default;
const { makeSession } = await import('./helpers/lookmax-session.js');
const api = await import('../routes/api.js');

const app = express();
app.use(express.json());
app.use('/api/lookmax/tokens', tokensRouter);
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('User token helpers', () => {
  it('adds and spends tokens', async () => {
    const u = await User.getOrCreateByEmail({ email: 'tok@example.com', name: 'Tok' });
    await User.addTokens(u.phone, 50);
    expect((await User.getUserByToken(u.token)).tokens).toBe(50);
    const spend = await User.spendTokens(u.phone, 8);
    expect(spend.ok).toBe(true);
    expect(spend.tokens).toBe(42);
  });
  it('refuses to overspend', async () => {
    const u = await User.getOrCreateByEmail({ email: 'low@example.com', name: 'Low' });
    await User.addTokens(u.phone, 3);
    const spend = await User.spendTokens(u.phone, 5);
    expect(spend.ok).toBe(false);
    expect(spend.reason).toBe('insufficient');
    expect((await User.getUserByToken(u.token)).tokens).toBe(3);
  });
});

describe('GET /api/lookmax/tokens', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/lookmax/tokens')).status).toBe(401);
  });
  it('returns balance + packs + tool costs', async () => {
    const { bearer } = await makeSession();
    const res = await request(app).get('/api/lookmax/tokens').set('Authorization', bearer);
    expect(res.status).toBe(200);
    expect(res.body.packs.starter.tokens).toBe(50);
    expect(res.body.packs.starter.inr).toBe('₹499');
    expect(res.body.toolCosts.fullAnalysis).toBe(8);
  });
});

describe('POST /api/lookmax/tokens/buy (bypass)', () => {
  it('credits tokens immediately in test/bypass mode', async () => {
    const { bearer, user } = await makeSession();
    const res = await request(app).post('/api/lookmax/tokens/buy').set('Authorization', bearer).send({ pack: 'starter' });
    expect(res.status).toBe(200);
    expect(res.body.credited).toBe(true);
    expect(res.body.added).toBe(50);
    expect((await User.getUserByToken(user.token)).tokens).toBe(50);
  });
  it('rejects an unknown pack', async () => {
    const { bearer } = await makeSession();
    expect((await request(app).post('/api/lookmax/tokens/buy').set('Authorization', bearer).send({ pack: 'nope' })).status).toBe(400);
  });
});

describe('webhook credits tokens for a token order', () => {
  it('processPaymentEvent credits the buyer on payment.captured', async () => {
    const u = await User.getOrCreateByEmail({ email: 'buyer@example.com', name: 'Buyer' });
    const before = (await User.getUserByToken(u.token)).tokens || 0;
    await api.processPaymentEvent({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_x', notes: { kind: 'tokens', tokens: '120', userId: u.token } } } },
    });
    expect((await User.getUserByToken(u.token)).tokens).toBe(before + 120);
  });
});
