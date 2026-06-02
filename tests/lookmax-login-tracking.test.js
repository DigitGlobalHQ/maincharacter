/**
 * PR B — login tracking. Every successful sign-in records lastLoginAt /
 * firstLoginAt / loginCount / authProvider on the user, so /admin can show
 * "who has signed in and when". Test-first per CLAUDE.md §6.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-login-track-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.ADMIN_PASSWORD = 'adminpass1';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES = '918595833852';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.WHATSAPP_SEND_MODE = 'off';

const request = require('supertest');
const express = require('express');
const User = require('../models/User');
const { recordLogin } = require('../lib/lookmax-auth');
const authRouter = require('../routes/lookmax-auth');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('recordLogin()', () => {
  it('stamps lastLoginAt, firstLoginAt, loginCount=1 and the provider on first sign-in', async () => {
    const u = await User.getOrCreateByEmail({ email: 'rec1@example.test', name: 'Rec One' });
    expect(u.loginCount || 0).toBe(0);

    const after = await recordLogin(u, 'google');
    expect(after.loginCount).toBe(1);
    expect(after.authProvider).toBe('google');
    expect(after.lastLoginAt).toBeTruthy();
    expect(after.firstLoginAt).toBe(after.lastLoginAt);
  });

  it('increments loginCount and advances lastLoginAt but never rewrites firstLoginAt', async () => {
    const u = await User.getOrCreateByEmail({ email: 'rec2@example.test', name: 'Rec Two' });
    const first = await recordLogin(u, 'email');
    await new Promise((r) => setTimeout(r, 5));
    const second = await recordLogin(first, 'email');

    expect(second.loginCount).toBe(2);
    expect(second.firstLoginAt).toBe(first.firstLoginAt);
    expect(second.lastLoginAt >= first.lastLoginAt).toBe(true);
  });

  it('falls back to the stored authProvider when no provider is passed', async () => {
    const u = await User.getOrCreateByEmail({ email: 'rec3@example.test', name: 'Rec Three', provider: 'email' });
    const after = await recordLogin(u);
    expect(after.authProvider).toBe('email');
  });

  it('never throws on a malformed user', async () => {
    await expect(recordLogin(null, 'x')).resolves.toBeFalsy();
    await expect(recordLogin({}, 'x')).resolves.toBeTruthy();
  });
});

describe('admin-login persists a login stamp', () => {
  it('records authProvider=admin and increments loginCount across logins', async () => {
    const login = () => request(app)
      .post('/api/lookmax/auth/admin-login')
      .send({ phone: '8595833852', password: 'adminpass1' });

    const r1 = await login();
    expect(r1.status).toBe(200);
    let user = await User.getUserByPhone('918595833852');
    expect(user.loginCount).toBe(1);
    expect(user.authProvider).toBe('admin');
    expect(user.lastLoginAt).toBeTruthy();
    expect(user.firstLoginAt).toBe(user.lastLoginAt);

    await new Promise((r) => setTimeout(r, 5));
    const r2 = await login();
    expect(r2.status).toBe(200);
    user = await User.getUserByPhone('918595833852');
    expect(user.loginCount).toBe(2);
    expect(user.firstLoginAt).not.toBe(user.lastLoginAt);
  });
});
