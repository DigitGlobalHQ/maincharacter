/**
 * tests/reaudit-status.test.js
 *
 * Verifies eligibility math for GET /api/lookmax/reaudit/status.
 * D29 → not eligible, D30+ → eligible, completed → eligible-but-also-viewable.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-reaudit-status-'));
process.env.USERS_FILE_PATH          = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH       = path.join(tmpDir, 'waitlist.json');
process.env.AUDIT_SESSIONS_FILE_PATH = path.join(tmpDir, 'audit-sessions.json');
process.env.LOOKMAX_FILE_PATH        = path.join(tmpDir, 'lookmax.json');
process.env.ADMIN_PASSWORD           = 'statuspass';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES             = '918595000001';
process.env.JWT_SECRET               = 'status-test-secret';
process.env.WHATSAPP_SEND_MODE       = 'off';
delete process.env.GEMINI_API_KEY;
delete process.env.DATABASE_URL;

const request  = require('supertest');
const express  = require('express');
const User     = require('../models/User');

const lookmaxRoutes = require('../routes/lookmax');
const authRoutes    = require('../routes/lookmax-auth');
const reauditRoutes = require('../routes/reaudit');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRoutes);
app.use('/api/lookmax', lookmaxRoutes);
app.use('/api/lookmax', reauditRoutes);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

// The admin phone normalized (10-digit → 91-prefix)
const ADMIN_PHONE = '918595000001';

async function adminToken() {
  const r = await request(app)
    .post('/api/lookmax/auth/admin-login')
    .send({ phone: '8595000001', password: 'statuspass' });
  return r.body.token;
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

const BASELINE = {
  scores: { skinClarity: 55, jawDefinition: 50, eyeArea: 60, hairDensity: 62,
            posture: 58, facialHarmony: 52, expression: 48, bodyComposition: 65 },
  leverageAxis: 'expression',
  overall: 56,
  capturedAt: new Date().toISOString(),
  photoStorageKeys: {},
};

describe('GET /api/lookmax/reaudit/status', () => {
  it('401s without auth token', async () => {
    const res = await request(app).get('/api/lookmax/reaudit/status');
    expect(res.status).toBe(401);
  });

  it('not eligible when lookmaxxingActive is false', async () => {
    // Admin login creates user with lookmaxxingActive=true (admin-login.js line 324)
    // so we need to override it after creating
    const t = await adminToken();
    User.updateUser(ADMIN_PHONE, { lookmaxxingActive: false, lookmaxBaseline: null });
    const res = await request(app)
      .get('/api/lookmax/reaudit/status')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
  });

  it('not eligible at day 29 even with baseline', async () => {
    const t = await adminToken();
    User.updateUser(ADMIN_PHONE, {
      lookmaxxingActive: true,
      lookmaxxingStartedAt: daysAgo(29),
      lookmaxBaseline: BASELINE,
      reAuditCompletedThisCycle: false,
    });

    const res = await request(app)
      .get('/api/lookmax/reaudit/status')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.daysSincePayment).toBeLessThan(30);
    expect(res.body.baselineAvailable).toBe(true);
    expect(res.body.completed).toBe(false);
  });

  it('eligible at exactly day 30', async () => {
    const t = await adminToken();
    User.updateUser(ADMIN_PHONE, {
      lookmaxxingActive: true,
      lookmaxxingStartedAt: daysAgo(30),
      lookmaxBaseline: BASELINE,
      reAuditCompletedThisCycle: false,
    });

    const res = await request(app)
      .get('/api/lookmax/reaudit/status')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.daysSincePayment).toBeGreaterThanOrEqual(30);
    expect(res.body.baselineAvailable).toBe(true);
    expect(res.body.completed).toBe(false);
  });

  it('eligible at day 45 (past day 30)', async () => {
    const t = await adminToken();
    User.updateUser(ADMIN_PHONE, {
      lookmaxxingActive: true,
      lookmaxxingStartedAt: daysAgo(45),
      lookmaxBaseline: BASELINE,
      reAuditCompletedThisCycle: false,
    });

    const res = await request(app)
      .get('/api/lookmax/reaudit/status')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.daysSincePayment).toBeGreaterThanOrEqual(30);
  });

  it('not eligible when baseline is missing even at day 30+', async () => {
    const t = await adminToken();
    User.updateUser(ADMIN_PHONE, {
      lookmaxxingActive: true,
      lookmaxxingStartedAt: daysAgo(35),
      lookmaxBaseline: null,
      reAuditCompletedThisCycle: false,
    });

    const res = await request(app)
      .get('/api/lookmax/reaudit/status')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(false);
    expect(res.body.baselineAvailable).toBe(false);
  });

  it('completed=true and eligible=true when reAuditResult exists', async () => {
    const t = await adminToken();
    User.updateUser(ADMIN_PHONE, {
      lookmaxxingActive: true,
      lookmaxxingStartedAt: daysAgo(32),
      lookmaxBaseline: BASELINE,
      reAuditCompletedThisCycle: true,
      reAuditResult: {
        scores: { skinClarity: 60 },
        deltas: { skinClarity: 5 },
        mirrorLevel: 'polished',
        completedAt: new Date().toISOString(),
      },
    });

    const res = await request(app)
      .get('/api/lookmax/reaudit/status')
      .set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.eligible).toBe(true);
    expect(res.body.completed).toBe(true);
    expect(res.body.reAuditResult).toBeTruthy();
    expect(res.body.reAuditResult.mirrorLevel).toBe('polished');
  });

  it('response shape is correct', async () => {
    const t = await adminToken();
    const res = await request(app)
      .get('/api/lookmax/reaudit/status')
      .set('Authorization', `Bearer ${t}`);
    expect(res.body).toHaveProperty('eligible');
    expect(res.body).toHaveProperty('daysSincePayment');
    expect(res.body).toHaveProperty('completed');
    expect(res.body).toHaveProperty('baselineAvailable');
    expect(res.body).toHaveProperty('reAuditResult');
  });
});
