/**
 * tests/funnel-repair-p2-google.test.js
 * Google OAuth sign-in (funnel-repair P2) + the email/Google find-or-create helper.
 * Mirrors the lookmax-auth harness; mocks Google's token endpoint so the whole
 * server-side path is exercised without a live Google call.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-p2-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
process.env.UPGRADE_BASE_URL = 'https://example.test';

const request = require('supertest');
const express = require('express');
const authRouter = require('../routes/lookmax-auth');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

function b64u(obj) { return Buffer.from(JSON.stringify(obj)).toString('base64url'); }
function fakeIdToken(payload) { return `h.${b64u(payload)}.s`; }
function cookieValue(setCookie, name) {
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  const entry = arr.find((c) => c && c.startsWith(name + '='));
  return entry ? entry.split(';')[0].split('=').slice(1).join('=') : null;
}

describe('User.getOrCreateByEmail', () => {
  it('creates an email-keyed user (synthetic phone) then is idempotent by email', async () => {
    const a = await User.getOrCreateByEmail({ email: 'New.Person@Gmail.com', name: 'New Person' });
    expect(a).toBeTruthy();
    expect(a.email).toBe('new.person@gmail.com'); // normalised
    expect(a.phone).toMatch(/^e[0-9a-f]{18}$/);   // synthetic, non-numeric
    expect(a.token).toBeTruthy();

    const b = await User.getOrCreateByEmail({ email: 'new.person@gmail.com' });
    expect(b.token).toBe(a.token); // same account, not a duplicate
  });

  it('rejects an invalid email', async () => {
    await expect(User.getOrCreateByEmail({ email: 'not-an-email' })).rejects.toThrow();
  });
});

describe('GET /api/lookmax/auth/google/start', () => {
  it('redirects to Google consent with the right params + sets a nonce cookie', async () => {
    const res = await request(app).get('/api/lookmax/auth/google/start?next=/lookmaxing/quiz');
    expect(res.status).toBe(302);
    const loc = res.headers.location;
    expect(loc).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(loc).toContain('client_id=test-client-id');
    expect(loc).toContain('redirect_uri=https%3A%2F%2Fexample.test%2Fapi%2Flookmax%2Fauth%2Fgoogle%2Fcallback');
    expect(loc).toContain('scope=openid+email+profile');
    expect(loc).toContain('state=');
    expect(cookieValue(res.headers['set-cookie'], 'g_oauth_nonce')).toBeTruthy();
  });

  it('refuses an off-site next (no open redirect)', async () => {
    const res = await request(app).get('/api/lookmax/auth/google/start?next=//evil.com');
    const state = new URL(res.headers.location).searchParams.get('state');
    const decoded = authRouter._verifyState(state);
    expect(decoded.next).toBe('/lookmaxing/quiz'); // coerced to safe default
  });
});

describe('GET /api/lookmax/auth/google/callback', () => {
  it('redirects to the start with an error on a bad state', async () => {
    const res = await request(app).get('/api/lookmax/auth/google/callback?code=x&state=bogus');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/lookmaxing/start?error=google_signin');
  });

  it('rejects when the nonce cookie does not match the state', async () => {
    const start = await request(app).get('/api/lookmax/auth/google/start?next=/lookmaxing/quiz');
    const state = new URL(start.headers.location).searchParams.get('state');
    // No nonce cookie supplied → mismatch.
    const res = await request(app).get(`/api/lookmax/auth/google/callback?code=x&state=${encodeURIComponent(state)}`);
    expect(res.headers.location).toBe('/lookmaxing/start?error=google_signin');
  });

  it('completes sign-in and bridges with a one-shot token (mocked Google)', async () => {
    const start = await request(app).get('/api/lookmax/auth/google/start?next=/lookmaxing/quiz');
    const state = new URL(start.headers.location).searchParams.get('state');
    const nonce = cookieValue(start.headers['set-cookie'], 'g_oauth_nonce');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: fakeIdToken({ email: 'oauth.user@gmail.com', email_verified: true, name: 'OAuth User' }) }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app)
      .get(`/api/lookmax/auth/google/callback?code=authcode123&state=${encodeURIComponent(state)}`)
      .set('Cookie', `g_oauth_nonce=${nonce}`);

    vi.unstubAllGlobals();

    expect(fetchMock).toHaveBeenCalledWith('https://oauth2.googleapis.com/token', expect.objectContaining({ method: 'POST' }));
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/lookmax\/oauth-complete\?flt=[0-9a-f]{64}&next=%2Flookmaxing%2Fquiz$/);

    // A user now exists for that email, holding a one-shot firstLoginToken.
    const user = await User.getUserByEmail('oauth.user@gmail.com');
    expect(user).toBeTruthy();
    expect(user.firstLoginToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects an unverified Google email', async () => {
    const start = await request(app).get('/api/lookmax/auth/google/start?next=/lookmaxing/quiz');
    const state = new URL(start.headers.location).searchParams.get('state');
    const nonce = cookieValue(start.headers['set-cookie'], 'g_oauth_nonce');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id_token: fakeIdToken({ email: 'unverified@gmail.com', email_verified: false }) }),
    }));
    const res = await request(app)
      .get(`/api/lookmax/auth/google/callback?code=c&state=${encodeURIComponent(state)}`)
      .set('Cookie', `g_oauth_nonce=${nonce}`);
    vi.unstubAllGlobals();
    expect(res.headers.location).toBe('/lookmaxing/start?error=google_signin');
  });
});
