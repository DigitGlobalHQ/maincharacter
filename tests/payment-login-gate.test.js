/**
 * Tests for Login Gate modifications in routes/api.js:
 *  1. processPaymentEvent — mints firstLoginToken on lookmaxxing activation
 *  2. GET /api/payment/status — conditionally includes firstLoginToken
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const SECRET = 'test_webhook_secret_lgate';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-lgate-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.RAZORPAY_WEBHOOK_SECRET = SECRET;
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.JWT_SECRET = 'test-jwt-secret-lgate';

const request = require('supertest');
const express = require('express');
const apiRouter = require('../routes/api');
const User = require('../models/User');

const app = express();
app.use(express.json({ verify: (req, _res, buf) => (req.rawBody = buf) }));
app.use('/api', apiRouter);

function sign(raw) {
  return crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
}

beforeAll(() => {
  User.createUser({ name: 'LGateUser', phone: '919300000001', preferredTime: '08:00' });
  User.createUser({ name: 'LGateUser2', phone: '919300000002', preferredTime: '08:00' });
  User.createUser({ name: 'LGateOrator', phone: '919300000003', preferredTime: '08:00' });
  // Seed an email so receipt can be skipped cleanly (no-op for dry-run)
  User.updateUser('919300000001', { email: null });
  User.updateUser('919300000002', { email: null });
  User.updateUser('919300000003', { email: null });
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

// ─────────────────────────────────────────────────────────────────────────────
// processPaymentEvent — firstLoginToken mint
// ─────────────────────────────────────────────────────────────────────────────

describe('processPaymentEvent — mints firstLoginToken on lookmaxxing activation', () => {
  it('mints firstLoginToken (32-hex) + firstLoginExpiresAt (15min ahead) on subscription.activated with lookmaxxing pillar', async () => {
    const before = Date.now();
    await apiRouter.processPaymentEvent({
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id: 'sub_lgate1',
            notes: { phone: '919300000001', plan: 'lookmaxxing', pillars: 'lookmaxxing' },
          },
        },
      },
    });

    const u = User.getUserByPhone('919300000001');
    expect(u.lookmaxxingActive).toBe(true);
    expect(u.firstLoginToken).toBeTruthy();
    expect(typeof u.firstLoginToken).toBe('string');
    expect(u.firstLoginToken.length).toBe(64); // 32 bytes hex
    expect(u.firstLoginExpiresAt).toBeGreaterThan(before + 14 * 60 * 1000);
    expect(u.firstLoginExpiresAt).toBeLessThanOrEqual(before + 16 * 60 * 1000);
    expect(u.firstLoginConsumedAt).toBeNull();
  });

  it('mints firstLoginToken on payment_link.paid with lookmaxxing pillar', async () => {
    await apiRouter.processPaymentEvent({
      event: 'payment_link.paid',
      payload: {
        payment_link: {
          entity: {
            notes: { phone: '919300000002', plan: 'lookmaxxing', pillars: 'lookmaxxing' },
          },
        },
      },
    });
    const u = User.getUserByPhone('919300000002');
    expect(u.lookmaxxingActive).toBe(true);
    expect(u.firstLoginToken).toBeTruthy();
    expect(u.firstLoginToken.length).toBe(64);
  });

  it('does NOT mint firstLoginToken when pillar is orator-only', async () => {
    await apiRouter.processPaymentEvent({
      event: 'subscription.activated',
      payload: {
        subscription: {
          entity: {
            id: 'sub_orator1',
            notes: { phone: '919300000003', plan: 'seeker', pillars: 'orator' },
          },
        },
      },
    });
    const u = User.getUserByPhone('919300000003');
    expect(u.oratorActive).toBe(true);
    expect(u.firstLoginToken).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payment/status — firstLoginToken field
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /api/payment/status — firstLoginToken field', () => {
  const SUB_ID = 'sub_status_lgate';

  beforeAll(() => {
    // User with lookmaxxingActive + a valid (un-consumed, un-expired) firstLoginToken
    User.createUser({ name: 'StatusUser', phone: '919300000010', preferredTime: '08:00' });
    User.updateUser('919300000010', {
      razorpaySubscriptionId: SUB_ID,
      lookmaxxingActive: true,
      firstLoginToken: 'statustoken' + '0'.repeat(53), // 64 chars total
      firstLoginExpiresAt: Date.now() + 15 * 60 * 1000,
      firstLoginConsumedAt: null,
    });
  });

  it('includes firstLoginToken when LOOKMAX_EMAIL_LOGIN=true AND all conditions met', async () => {
    process.env.LOOKMAX_EMAIL_LOGIN = 'true';
    const res = await request(app).get(`/api/payment/status?subscriptionId=${SUB_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(res.body.firstLoginToken).toBeTruthy();
    expect(res.body.firstLoginToken).toBe('statustoken' + '0'.repeat(53));
  });

  it('omits firstLoginToken when LOOKMAX_EMAIL_LOGIN=false', async () => {
    process.env.LOOKMAX_EMAIL_LOGIN = 'false';
    const res = await request(app).get(`/api/payment/status?subscriptionId=${SUB_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(true);
    expect(res.body.firstLoginToken).toBeUndefined();
    // Restore
    process.env.LOOKMAX_EMAIL_LOGIN = 'true';
  });

  it('omits firstLoginToken when token is already consumed', async () => {
    process.env.LOOKMAX_EMAIL_LOGIN = 'true';
    User.updateUser('919300000010', { firstLoginConsumedAt: new Date().toISOString() });
    const res = await request(app).get(`/api/payment/status?subscriptionId=${SUB_ID}`);
    expect(res.body.firstLoginToken).toBeUndefined();
    // Restore
    User.updateUser('919300000010', { firstLoginConsumedAt: null });
  });

  it('omits firstLoginToken when token is expired', async () => {
    process.env.LOOKMAX_EMAIL_LOGIN = 'true';
    User.updateUser('919300000010', { firstLoginExpiresAt: Date.now() - 1000 });
    const res = await request(app).get(`/api/payment/status?subscriptionId=${SUB_ID}`);
    expect(res.body.firstLoginToken).toBeUndefined();
    // Restore
    User.updateUser('919300000010', { firstLoginExpiresAt: Date.now() + 15 * 60 * 1000 });
  });

  it('omits firstLoginToken when lookmaxxingActive is false', async () => {
    process.env.LOOKMAX_EMAIL_LOGIN = 'true';
    User.updateUser('919300000010', { lookmaxxingActive: false });
    const res = await request(app).get(`/api/payment/status?subscriptionId=${SUB_ID}`);
    expect(res.body.firstLoginToken).toBeUndefined();
    // Restore
    User.updateUser('919300000010', { lookmaxxingActive: true });
  });

  it('returns {found: false} for unknown subscriptionId', async () => {
    const res = await request(app).get('/api/payment/status?subscriptionId=unknown_xyz');
    expect(res.status).toBe(200);
    expect(res.body.found).toBe(false);
  });
});
