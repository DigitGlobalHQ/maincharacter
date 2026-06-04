/**
 * Email + password sign-in/sign-up (the "works now, zero-config" method).
 * One smart endpoint POST /api/lookmax/auth/password = login-or-signup.
 * Test-first (§6).
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-pw-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.WHATSAPP_SEND_MODE = 'off';

const request = require('supertest');
const express = require('express');
const User = require('../models/User');
const { verifyLookmaxToken } = require('../lib/lookmax-auth');
const authRouter = require('../routes/lookmax-auth');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRouter);

beforeEach(() => { authRouter._ipCooldown && authRouter._ipCooldown.clear(); });
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const pw = (body) => request(app).post('/api/lookmax/auth/password').send(body);

describe('POST /auth/password — sign up (new email)', () => {
  it('creates an account, returns a valid session token, flags created:true', async () => {
    const r = await pw({ email: 'New@Example.test', password: 'correct horse 9' });
    expect(r.status).toBe(200);
    expect(r.body.created).toBe(true);
    expect(r.body.token).toBeTruthy();
    const decoded = verifyLookmaxToken(r.body.token);
    expect(decoded).toBeTruthy();
    const u = await User.getUserByEmail('new@example.test'); // normalized lower-case
    expect(u.passwordHash).toBeTruthy();
    expect(u.passwordHash).not.toContain('correct horse 9'); // hashed, not plaintext
    expect(u.authProvider).toBe('password');
  });

  it('rejects a too-short password (min 8) and creates nothing', async () => {
    const r = await pw({ email: 'short@example.test', password: 'abc' });
    expect(r.status).toBe(400);
    expect(await User.getUserByEmail('short@example.test')).toBeFalsy();
  });

  it('rejects a malformed email', async () => {
    expect((await pw({ email: 'nope', password: 'longenough1' })).status).toBe(400);
  });
});

describe('POST /auth/password — sign in (returning)', () => {
  it('logs in with the correct password (created:false)', async () => {
    await pw({ email: 'ret@example.test', password: 'mypassword12' });
    const r = await pw({ email: 'ret@example.test', password: 'mypassword12' });
    expect(r.status).toBe(200);
    expect(r.body.created).toBe(false);
    expect(r.body.token).toBeTruthy();
  });

  it('rejects a wrong password with a generic 401', async () => {
    await pw({ email: 'ret2@example.test', password: 'rightpass123' });
    const r = await pw({ email: 'ret2@example.test', password: 'WRONGpass123' });
    expect(r.status).toBe(401);
    expect(r.body.token).toBeFalsy();
  });
});

describe('POST /auth/password — account that uses Google/OTP (no password set)', () => {
  it('does not let a password hijack a passwordless account; guides to the right method', async () => {
    await User.getOrCreateByEmail({ email: 'google@example.test', name: 'G', provider: 'google' });
    const r = await pw({ email: 'google@example.test', password: 'tryingtoset12' });
    expect(r.status).toBe(409);
    expect(r.body.token).toBeFalsy();
    // the passwordless account must remain password-less
    const u = await User.getUserByEmail('google@example.test');
    expect(u.passwordHash).toBeFalsy();
  });
});

describe('POST /auth/password — brute-force guard', () => {
  it('cools down an IP after repeated wrong passwords', async () => {
    await pw({ email: 'victim@example.test', password: 'realpass1234' });
    for (let i = 0; i < 3; i++) await pw({ email: 'victim@example.test', password: 'badpass00' + i });
    // even the correct password is now refused while cooled
    const r = await pw({ email: 'victim@example.test', password: 'realpass1234' });
    expect(r.status).toBe(401);
  });
});
