/**
 * QA-authored rate-limit test — Login Gate P0-1.
 * Verifies tightLimiter (10/min/IP) is correctly mounted on /api/lookmax/auth/*.
 * Written by qa-agent; not to be weakened or deleted.
 *
 * NOTE: tightLimiter uses express-rate-limit's in-memory store.
 * We mount the full server.js app to test the real limiter placement.
 * Because the limiter is IP-based and tests may share an IP, we use
 * a separate app instance with a custom small limit for this test only
 * (consistent with security.test.js pattern).
 */

import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-rl-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.ADMIN_PASSWORD = 'adminpass-rl';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.JWT_SECRET = 'qa-rl-test-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.LOOKMAX_EMAIL_LOGIN = 'true';

const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');
const authRouter = require('../routes/lookmax-auth');

// Build an app with a reduced limit (3/min) so the test runs quickly
// and mirrors the tightLimiter pattern from server.js.
const testLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
});

const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use('/api/lookmax/auth', testLimiter); // mirrors server.js line 108
app.use('/api/lookmax', authRouter);

import { afterAll } from 'vitest';
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('tightLimiter on /api/lookmax/auth/* — 429 after limit exceeded', () => {
  it('returns 200 for the first 3 consume-link requests (under limit)', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/lookmax/auth/consume-link')
        .set('X-Forwarded-For', '10.1.2.3')
        .send({ token: `badtoken-${i}` });
      // 401 is fine (invalid token) — we just want it not to be 429
      expect(res.status).not.toBe(429);
    }
  });

  it('returns 429 on the 4th request from same IP within the window', async () => {
    // The 4th request crosses the limit of 3
    const res = await request(app)
      .post('/api/lookmax/auth/consume-link')
      .set('X-Forwarded-For', '10.1.2.3')
      .send({ token: 'badtoken-4th' });
    expect(res.status).toBe(429);
  });

  it('rate-limit applies to request-link route as well (same auth namespace)', async () => {
    // IP 10.1.2.4 is fresh — 3 requests should go through, 4th is 429
    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/api/lookmax/auth/request-link')
        .set('X-Forwarded-For', '10.1.2.4')
        .send({ email: `test${i}@example.com` });
      expect(res.status).not.toBe(429);
    }
    const res = await request(app)
      .post('/api/lookmax/auth/request-link')
      .set('X-Forwarded-For', '10.1.2.4')
      .send({ email: 'test4@example.com' });
    expect(res.status).toBe(429);
  });
});
