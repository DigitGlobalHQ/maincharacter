/**
 * tests/dpdpa-export.test.js — Task 2c DPDPA data export endpoint
 *
 * Asserts:
 *   - GET /api/lookmax/me/data/export returns correct shape
 *   - response.photoUrls contains signed URLs (mocked), not raw R2 keys
 *   - response.user does not expose internal flags (pushSubscription, etc.)
 *   - events array is present (may be empty)
 *   - schema: 1 and exportedAt are present
 *   - 401 when unauthenticated
 *   - 403 when DPDPA_RIGHTS_ENABLED=false
 *
 * Storage and vision are mocked — no real R2 or Gemini calls.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// ── Isolated env ─────────────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-dpdpa-export-'));
process.env.USERS_FILE_PATH         = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH      = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH       = path.join(tmpDir, 'lookmax.json');
process.env.AUDIT_SESSIONS_FILE_PATH= path.join(tmpDir, 'audit-sessions.json');
process.env.UPLOAD_DIR              = path.join(tmpDir, 'uploads');
process.env.ADMIN_PASSWORD          = 'exportpass';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES            = '918595833852';
process.env.JWT_SECRET              = 'export-secret';
process.env.WHATSAPP_SEND_MODE      = 'off';
process.env.DPDPA_RIGHTS_ENABLED    = 'true';
delete process.env.GEMINI_API_KEY;
delete process.env.DATABASE_URL;
delete process.env.R2_ACCOUNT_ID;
// ─────────────────────────────────────────────────────────────────────────────

const request = require('supertest');
const express = require('express');
const authRoutes = require('../routes/lookmax-auth');
const lookmaxRoutes = require('../routes/lookmax');
const storage = require('../services/storage');
const events = require('../services/events');

// Mock storage.getSignedUrl so we get predictable URLs without R2
vi.spyOn(storage, 'getSignedUrl').mockImplementation(async (key, ttl) => {
  return `https://r2-mock.example.com/${key}?ttl=${ttl}`;
});
// Mock storage.delete (for data deletion tests)
vi.spyOn(storage, 'delete').mockResolvedValue(true);

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRoutes);
app.use('/api/lookmax', lookmaxRoutes);

let token;
let testUser;

beforeAll(async () => {
  const loginResp = await request(app)
    .post('/api/lookmax/auth/admin-login')
    .send({ phone: '8595833852', password: 'exportpass' });
  token = loginResp.body.token;

  // Fetch the user so tests can inspect fields
  const meResp = await request(app)
    .get('/api/lookmax/me')
    .set('Authorization', `Bearer ${token}`);
  testUser = meResp.body.user || meResp.body;
}, 15000);

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('GET /api/lookmax/me/data/export — shape', () => {
  it('requires authentication — 401 without token', async () => {
    const resp = await request(app).get('/api/lookmax/me/data/export');
    expect(resp.status).toBe(401);
  });

  it('returns 200 with correct top-level schema', async () => {
    const resp = await request(app)
      .get('/api/lookmax/me/data/export')
      .set('Authorization', `Bearer ${token}`);
    expect(resp.status).toBe(200);
    expect(resp.body).toMatchObject({
      exportedAt: expect.any(String),
      schema: 1,
      user: expect.any(Object),
      audits: expect.any(Array),
      events: expect.any(Array),
      photoUrls: expect.any(Array),
    });
  });

  it('user block omits internal flags (pushSubscription, magicLinkToken, etc.)', async () => {
    const resp = await request(app)
      .get('/api/lookmax/me/data/export')
      .set('Authorization', `Bearer ${token}`);
    const u = resp.body.user;
    expect(u).not.toHaveProperty('pushSubscription');
    expect(u).not.toHaveProperty('magicLinkToken');
    expect(u).not.toHaveProperty('firstLoginToken');
    // Should have safe public fields
    expect(u).toHaveProperty('name');
    expect(u).toHaveProperty('createdAt');
  });

  it('photoUrls contains HTTPS signed URLs, not raw R2 keys', async () => {
    // Force at least one photo path into the user's lookmax record
    const Lookmax = require('../models/Lookmax');
    const User    = require('../models/User');
    const user    = User.getUserByPhone('918595833852');
    if (user) {
      Lookmax.addMirror(user.token, {
        photoPath: `r2:mirror/${user.token}/2026-01-01.jpg`,
        axes: { skinClarity: 60 },
        overallScore: 60,
        mirrorLevel: 'magnetic',
      });
    }

    const resp = await request(app)
      .get('/api/lookmax/me/data/export')
      .set('Authorization', `Bearer ${token}`);
    expect(resp.status).toBe(200);

    // All photoUrls must be HTTPS, never raw keys
    for (const url of resp.body.photoUrls) {
      expect(url).toMatch(/^https?:\/\//);
      // Must not expose raw R2 key format (r2:mirror/...)
      expect(url).not.toMatch(/^r2:/);
    }
  });

  it('no raw R2 storage keys appear anywhere in the response body', async () => {
    const resp = await request(app)
      .get('/api/lookmax/me/data/export')
      .set('Authorization', `Bearer ${token}`);
    const bodyStr = JSON.stringify(resp.body);
    expect(bodyStr).not.toMatch(/^r2:/);
    expect(bodyStr).not.toMatch(/"r2:/);
  });

  it('exportedAt is a valid ISO 8601 timestamp', async () => {
    const resp = await request(app)
      .get('/api/lookmax/me/data/export')
      .set('Authorization', `Bearer ${token}`);
    expect(() => new Date(resp.body.exportedAt)).not.toThrow();
    expect(new Date(resp.body.exportedAt).getTime()).toBeGreaterThan(0);
  });
});

describe('GET /api/lookmax/me/data/export — feature flag', () => {
  it('returns 403 when DPDPA_RIGHTS_ENABLED=false', async () => {
    process.env.DPDPA_RIGHTS_ENABLED = 'false';
    const resp = await request(app)
      .get('/api/lookmax/me/data/export')
      .set('Authorization', `Bearer ${token}`);
    expect(resp.status).toBe(403);
    process.env.DPDPA_RIGHTS_ENABLED = 'true';
  });
});
