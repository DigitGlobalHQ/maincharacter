/**
 * tests/lookmax-account-delete.test.js
 * A signed-in user can delete their own account (must sign up again); auth required.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-acct-del-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.WHATSAPP_SEND_MODE = 'off';

const request = (await import('supertest')).default;
const express = (await import('express')).default;
const authRouter = (await import('../routes/lookmax-auth.js')).default;
const User = (await import('../models/User.js')).default;
const { makeSession } = await import('./helpers/lookmax-session.js');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('DELETE /api/lookmax/account', () => {
  it('rejects an unauthenticated caller', async () => {
    const res = await request(app).delete('/api/lookmax/account');
    expect(res.status).toBe(401);
  });

  it('deletes the signed-in user and invalidates their token', async () => {
    const { token, user, bearer } = await makeSession();
    const res = await request(app).delete('/api/lookmax/account').set('Authorization', bearer);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    // token no longer resolves → the session is dead, must sign up again
    expect(await User.getUserByToken(token)).toBeNull();
    expect(await User.getUserByEmail(user.email)).toBeNull();
  });
});
