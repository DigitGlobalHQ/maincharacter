/**
 * tests/admin-delete-user.test.js
 * Admin can hard-delete a user (they must sign up again); auth required;
 * User.deleteUser frees the email + invalidates token resolution.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-del-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.ADMIN_PASSWORD = 'testpass-del';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const adminRouter = require('../routes/admin');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

let token;
beforeAll(async () => {
  const login = await request(app).post('/api/admin/login').send({ password: 'testpass-del' });
  token = login.body.token;
});
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('User.deleteUser', () => {
  it('removes the record and frees the email', async () => {
    const u = await User.getOrCreateByEmail({ email: 'gone@example.com', name: 'Gone' });
    expect(await User.getUserByEmail('gone@example.com')).toBeTruthy();
    const removed = await User.deleteUser(u.phone);
    expect(removed).toBe(true);
    expect(await User.getUserByEmail('gone@example.com')).toBeNull();
    expect(await User.getUserByToken(u.token)).toBeNull(); // token no longer resolves → must sign up again
  });
  it('returns false for an unknown user', async () => {
    expect(await User.deleteUser('e0000000000000000000')).toBe(false);
  });
});

describe('DELETE /api/admin/user/:phone', () => {
  it('rejects unauthenticated callers', async () => {
    const u = await User.getOrCreateByEmail({ email: 'keep@example.com', name: 'Keep' });
    const res = await request(app).delete('/api/admin/user/' + u.phone);
    expect(res.status).toBe(401);
    expect(await User.getUserByEmail('keep@example.com')).toBeTruthy(); // untouched
  });

  it('deletes a user when authenticated', async () => {
    const u = await User.getOrCreateByEmail({ email: 'bye@example.com', name: 'Bye' });
    const res = await request(app)
      .delete('/api/admin/user/' + u.phone)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);
    expect(await User.getUserByEmail('bye@example.com')).toBeNull();
  });

  it('404s on a non-existent user', async () => {
    const res = await request(app)
      .delete('/api/admin/user/e9999999999999999999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('lets the same email sign up fresh after deletion', async () => {
    const u1 = await User.getOrCreateByEmail({ email: 'reuse@example.com', name: 'One' });
    await request(app).delete('/api/admin/user/' + u1.phone).set('Authorization', `Bearer ${token}`);
    const u2 = await User.getOrCreateByEmail({ email: 'reuse@example.com', name: 'Two' });
    expect(u2.token).not.toBe(u1.token); // a brand-new account
  });
});
