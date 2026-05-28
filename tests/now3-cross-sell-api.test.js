/**
 * NOW-3 cross-sell eligibility — API tests.
 * Validates that GET /api/lookmax/dashboard returns crossSellEligible (bool).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-now3-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.UPLOAD_DIR = path.join(tmpDir, 'uploads');
process.env.ADMIN_PASSWORD = 'now3pass';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES = '918595833852';
process.env.JWT_SECRET = 'now3-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
delete process.env.GEMINI_API_KEY;

const request = require('supertest');
const express = require('express');
const lookmaxRoutes = require('../routes/lookmax');
const authRoutes = require('../routes/lookmax-auth');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRoutes);
app.use('/api/lookmax', lookmaxRoutes);

async function getToken() {
  const r = await request(app)
    .post('/api/lookmax/auth/admin-login')
    .send({ phone: '8595833852', password: 'now3pass' });
  return r.body.token;
}

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('GET /api/lookmax/dashboard — crossSellEligible field (NOW-3)', () => {
  it('returns crossSellEligible as a boolean in the response', async () => {
    const t = await getToken();
    const res = await request(app)
      .get('/api/lookmax/dashboard')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.crossSellEligible).toBe('boolean');
  });

  it('crossSellEligible is false when user has no lookmaxxingStartedAt', async () => {
    const t = await getToken();
    const res = await request(app)
      .get('/api/lookmax/dashboard')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    // Brand-new test user cannot be eligible — < 14 days old
    expect(res.body.crossSellEligible).toBe(false);
  });

  it('crossSellEligible is false when oratorActive is true (already has Orator)', async () => {
    const User = require('../models/User');
    const t = await getToken();
    // First get dashboard to confirm the user exists
    const dashRes = await request(app)
      .get('/api/lookmax/dashboard')
      .set('Authorization', `Bearer ${t}`);
    expect(dashRes.status).toBe(200);

    // Mark user as oratorActive, then check eligibility is false
    const user = User.getUserByPhone('8595833852');
    if (user) {
      User.updateUser(user.phone, { oratorActive: true });
      const res2 = await request(app)
        .get('/api/lookmax/dashboard')
        .set('Authorization', `Bearer ${t}`);
      expect(res2.body.crossSellEligible).toBe(false);
      // Reset
      User.updateUser(user.phone, { oratorActive: false });
    }
  });

  it('crossSellEligible is false when < 14 days since lookmaxxingStartedAt', async () => {
    const User = require('../models/User');
    const t = await getToken();
    const user = User.getUserByPhone('8595833852');
    if (user) {
      // Set lookmaxxingStartedAt to 10 days ago — should NOT be eligible
      const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
      User.updateUser(user.phone, {
        lookmaxxingActive: true,
        oratorActive: false,
        lookmaxxingStartedAt: tenDaysAgo,
      });
      const res = await request(app)
        .get('/api/lookmax/dashboard')
        .set('Authorization', `Bearer ${t}`);
      expect(res.status).toBe(200);
      expect(res.body.crossSellEligible).toBe(false);
    }
  });

  it('crossSellEligible is true when >= 14 days and lookmaxxingActive && !oratorActive', async () => {
    const User = require('../models/User');
    const t = await getToken();
    const user = User.getUserByPhone('8595833852');
    if (user) {
      // Set lookmaxxingStartedAt to 15 days ago — should be eligible
      const fifteenDaysAgo = new Date(Date.now() - 15 * 86400000).toISOString();
      User.updateUser(user.phone, {
        lookmaxxingActive: true,
        oratorActive: false,
        lookmaxxingStartedAt: fifteenDaysAgo,
      });
      const res = await request(app)
        .get('/api/lookmax/dashboard')
        .set('Authorization', `Bearer ${t}`);
      expect(res.status).toBe(200);
      expect(res.body.crossSellEligible).toBe(true);
    }
  });
});
