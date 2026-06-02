/**
 * QA-authored cross-user isolation test — Login Gate P0-1.
 * Spec §11: a JWT minted for user A must NOT allow reading user B's data.
 * lib/lookmax-auth.js enforces this via JWT signature verification.
 * Written by qa-agent; not to be weakened or deleted.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import jwt from 'jsonwebtoken';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-xuser-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.ADMIN_PASSWORD = 'adminpass-xuser';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.JWT_SECRET = 'qa-isolation-test-secret-xuser';
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.LOOKMAX_EMAIL_LOGIN = 'true';

const request = require('supertest');
const express = require('express');
const User = require('../models/User');
const authRouter = require('../routes/lookmax-auth');
const { signLookmaxToken } = require('../lib/lookmax-auth');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRouter);

let userA, userB;

beforeAll(() => {
  userA = User.createUser({ name: 'Alice', phone: '919111222111', preferredTime: '08:00' });
  userA = User.updateUser('919111222111', { lookmaxxingActive: true, email: 'alice-xuser@example.com' });

  userB = User.createUser({ name: 'Bob', phone: '919222111222', preferredTime: '08:00' });
  userB = User.updateUser('919222111222', { lookmaxxingActive: true, email: 'bob-xuser@example.com' });
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('Cross-user isolation — JWT signature enforcement', () => {
  it('valid JWT for user A returns user A data on /me', async () => {
    const tokenA = signLookmaxToken(userA);
    const res = await request(app)
      .get('/api/lookmax/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('919111222111');
  });

  it('valid JWT for user B returns user B data on /me — not user A', async () => {
    const tokenB = signLookmaxToken(userB);
    const res = await request(app)
      .get('/api/lookmax/me')
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    expect(res.body.user.phone).toBe('919222111222');
    expect(res.body.user.phone).not.toBe('919111222111');
  });

  it('a token for user A mutated to user B userId but re-signed with WRONG secret returns 401', async () => {
    // Attacker grabs user A's token, decodes the payload, swaps userId to user B's UUID,
    // and re-signs with a wrong secret. Must be rejected.
    const tamperedToken = jwt.sign(
      { userId: userB.token, phone: userB.phone, scope: 'lookmax' },
      'definitely-not-the-jwt-secret',
      { expiresIn: '24h' }
    );
    const res = await request(app)
      .get('/api/lookmax/me')
      .set('Authorization', `Bearer ${tamperedToken}`);
    expect(res.status).toBe(401);
  });

  it('a token with correct secret but wrong scope returns 401 (scope:admin cannot call lookmax routes)', async () => {
    const adminScopeToken = jwt.sign(
      { userId: userA.token, phone: userA.phone, scope: 'admin' },
      'qa-isolation-test-secret-xuser',
      { expiresIn: '24h' }
    );
    const res = await request(app)
      .get('/api/lookmax/me')
      .set('Authorization', `Bearer ${adminScopeToken}`);
    expect(res.status).toBe(401);
  });

  it('a token with correct secret but no scope returns 401', async () => {
    const noScopeToken = jwt.sign(
      { userId: userA.token, phone: userA.phone },
      'qa-isolation-test-secret-xuser',
      { expiresIn: '24h' }
    );
    const res = await request(app)
      .get('/api/lookmax/me')
      .set('Authorization', `Bearer ${noScopeToken}`);
    expect(res.status).toBe(401);
  });

  it('a valid-signature token with userId pointing at user A cannot read user B data', async () => {
    // Even with correct JWT_SECRET, user A token only resolves user A.
    // The route returns req.lookmaxUser which is fetched from the store by the decoded userId.
    // Verify: user A token always resolves to user A, never to B.
    const tokenA = signLookmaxToken(userA);
    const res = await request(app)
      .get('/api/lookmax/me')
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    expect(res.body.user.phone).not.toBe('919222111222'); // NOT user B
  });

  it('a well-formed token with the signature stripped / replaced returns 401', async () => {
    const tokenA = signLookmaxToken(userA);
    const parts = tokenA.split('.');
    const noSigToken = `${parts[0]}.${parts[1]}.invalidsignaturehere`;
    const res = await request(app)
      .get('/api/lookmax/me')
      .set('Authorization', `Bearer ${noSigToken}`);
    expect(res.status).toBe(401);
  });
});
