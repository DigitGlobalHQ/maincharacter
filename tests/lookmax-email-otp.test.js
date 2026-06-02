/**
 * PR A — Email OTP sign-in. A 6-digit code is emailed and exchanged for the
 * 45-day Lookmaxing session JWT. Dark behind LOOKMAX_EMAIL_LOGIN. Test-first (§6).
 *
 * The OTP is captured by monkeypatching sms.generateOtp (the route looks it up on
 * the module at call time), so the test never needs to read the email body.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-email-otp-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.LOOKMAX_EMAIL_LOGIN = 'true';
delete process.env.RESEND_API_KEY; // email stays DRY-RUN

const request = require('supertest');
const express = require('express');
const User = require('../models/User');
const sms = require('../services/sms');
const authRouter = require('../routes/lookmax-auth');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRouter);

const FIXED = '424242';
beforeEach(() => {
  sms.generateOtp = () => FIXED;
  // Reset the module-level rate-limit maps so per-IP cooldown / per-email
  // throttle from one test never bleeds into the next (proper isolation).
  authRouter._ipCooldown.clear();
  authRouter._emailThrottle.clear();
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const req = (body) => request(app).post('/api/lookmax/auth/request-email-otp').send(body);
const verify = (body) => request(app).post('/api/lookmax/auth/verify-email-otp').send(body);

describe('POST /auth/request-email-otp', () => {
  it('creates the account on a funnel sign-up and returns {status:sent}', async () => {
    const r = await req({ email: 'newseeker@example.test', next: '/lookmaxing/quiz' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('sent');
    const u = await User.getUserByEmail('newseeker@example.test');
    expect(u).toBeTruthy();
    expect(u.emailOtpHash).toBeTruthy();
    expect(u.emailOtpExpiresAt).toBeGreaterThan(Date.now());
  });

  it('is enumeration-safe: unknown email with no funnel next returns {status:sent}, creates nothing', async () => {
    const r = await req({ email: 'ghost@example.test' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('sent');
    expect(await User.getUserByEmail('ghost@example.test')).toBeFalsy();
  });

  it('no-ops for a missing/garbage email', async () => {
    expect((await req({ email: '' })).body.status).toBe('sent');
    expect((await req({ email: 'not-an-email' })).body.status).toBe('sent');
  });
});

describe('POST /auth/verify-email-otp', () => {
  it('exchanges the correct code for a session JWT and records the login', async () => {
    await req({ email: 'happy@example.test', next: '/lookmaxing/quiz' });
    const r = await verify({ email: 'happy@example.test', otp: FIXED });
    expect(r.status).toBe(200);
    expect(r.body.token).toBeTruthy();
    expect(r.body.user.token).toBeTruthy();
    const u = await User.getUserByEmail('happy@example.test');
    expect(u.emailOtpHash).toBeFalsy();        // consumed/cleared
    expect(u.loginCount).toBe(1);
    expect(u.authProvider).toBe('email');
  });

  it('rejects a wrong code with a generic 401 and counts the attempt', async () => {
    await req({ email: 'wrong@example.test', next: '/lookmaxing/quiz' });
    const r = await verify({ email: 'wrong@example.test', otp: '000000' });
    expect(r.status).toBe(401);
    expect(r.body.token).toBeFalsy();
    const u = await User.getUserByEmail('wrong@example.test');
    expect(u.emailOtpAttempts).toBe(1);
    expect(u.emailOtpHash).toBeTruthy();        // still pending, not consumed
  });

  it('locks out after the max attempts even if the right code is then supplied', async () => {
    await req({ email: 'brute@example.test', next: '/lookmaxing/quiz' });
    for (let i = 0; i < 5; i++) await verify({ email: 'brute@example.test', otp: '000000' });
    const r = await verify({ email: 'brute@example.test', otp: FIXED });
    expect(r.status).toBe(401);
  });

  it('rejects an expired code', async () => {
    await req({ email: 'stale@example.test', next: '/lookmaxing/quiz' });
    await User.updateUser((await User.getUserByEmail('stale@example.test')).phone, { emailOtpExpiresAt: Date.now() - 1 });
    const r = await verify({ email: 'stale@example.test', otp: FIXED });
    expect(r.status).toBe(401);
  });

  it('a consumed code cannot be reused', async () => {
    await req({ email: 'replay@example.test', next: '/lookmaxing/quiz' });
    expect((await verify({ email: 'replay@example.test', otp: FIXED })).status).toBe(200);
    expect((await verify({ email: 'replay@example.test', otp: FIXED })).status).toBe(401);
  });
});

describe('flag off (LOOKMAX_EMAIL_LOGIN unset)', () => {
  it('request no-ops and verify 401s', async () => {
    const prev = process.env.LOOKMAX_EMAIL_LOGIN;
    delete process.env.LOOKMAX_EMAIL_LOGIN;
    expect((await req({ email: 'off@example.test', next: '/lookmaxing/quiz' })).body.status).toBe('sent');
    expect(await User.getUserByEmail('off@example.test')).toBeFalsy();
    expect((await verify({ email: 'off@example.test', otp: FIXED })).status).toBe(401);
    process.env.LOOKMAX_EMAIL_LOGIN = prev;
  });
});
