/**
 * tests/admin-referral-codes.test.js
 * Tests for POST/GET /api/admin/referral-codes admin endpoints.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-admin-refcodes-'));
process.env.USERS_FILE_PATH      = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH   = path.join(tmpDir, 'waitlist.json');
process.env.AUDIT_V2_STORE_PATH  = path.join(tmpDir, 'audit-v2.json');
process.env.REFERRAL_CODES_FILE_PATH = path.join(tmpDir, 'referral-codes.json');
process.env.ADMIN_PASSWORD       = 'admin-ref-test-pw';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.WHATSAPP_SEND_MODE   = 'off';
process.env.EVENTS_BACKEND       = 'file';
process.env.EVENTS_JSONL_PATH    = path.join(tmpDir, 'events.jsonl');

const request        = (await import('supertest')).default;
const express        = (await import('express')).default;
const adminRouter    = (await import('../routes/admin.js')).default;

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

async function getToken() {
  const res = await request(app)
    .post('/api/admin/login')
    .send({ password: 'admin-ref-test-pw' });
  return res.body.token;
}

describe('POST /api/admin/referral-codes', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app)
      .post('/api/admin/referral-codes')
      .send({ percentOff: 20, maxUses: 1 });
    expect(res.status).toBe(401);
  });

  it('creates a code and returns the expected shape', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/admin/referral-codes')
      .set('Authorization', `Bearer ${token}`)
      .send({ percentOff: 20, maxUses: 1, note: 'launch promo' });
    expect(res.status).toBe(200);
    expect(res.body.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(res.body.percentOff).toBe(20);
    expect(res.body.maxUses).toBe(1);
    expect(res.body.uses).toBe(0);
    // discounted amounts: round(49900 * (1 - 20/100)) = round(39920) = 39920
    expect(res.body.discountedPaise).toBe(39920);
    expect(res.body.discountedInr).toBe(399.2);
    expect(typeof res.body.usd).toBe('string');
    expect(res.body.usd).toMatch(/^\$[\d.]+$/);
  });

  it('returns 400 for percentOff below 1', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/admin/referral-codes')
      .set('Authorization', `Bearer ${token}`)
      .send({ percentOff: 0, maxUses: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for percentOff above 100', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/admin/referral-codes')
      .set('Authorization', `Bearer ${token}`)
      .send({ percentOff: 101, maxUses: 1 });
    expect(res.status).toBe(400);
  });

  it('returns 400 for maxUses below 1', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/admin/referral-codes')
      .set('Authorization', `Bearer ${token}`)
      .send({ percentOff: 10, maxUses: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when percentOff is missing', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/admin/referral-codes')
      .set('Authorization', `Bearer ${token}`)
      .send({ maxUses: 1 });
    expect(res.status).toBe(400);
  });

  it('defaults maxUses to 1 when not supplied', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/admin/referral-codes')
      .set('Authorization', `Bearer ${token}`)
      .send({ percentOff: 50 });
    expect(res.status).toBe(200);
    expect(res.body.maxUses).toBe(1);
  });
});

describe('GET /api/admin/referral-codes', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/admin/referral-codes');
    expect(res.status).toBe(401);
  });

  it('returns the list including previously created codes', async () => {
    const token = await getToken();
    // Create a known code first
    const create = await request(app)
      .post('/api/admin/referral-codes')
      .set('Authorization', `Bearer ${token}`)
      .send({ percentOff: 30, maxUses: 2, note: 'list-test' });
    const createdCode = create.body.code;

    const res = await request(app)
      .get('/api/admin/referral-codes')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.codes)).toBe(true);
    const found = res.body.codes.find((c) => c.code === createdCode);
    expect(found).toBeTruthy();
    expect(found.percentOff).toBe(30);
    expect(found.maxUses).toBe(2);
    expect(found.uses).toBe(0);
    expect(found.active).toBe(true);
    expect(found.note).toBe('list-test');
    expect(found.createdAt).toBeTruthy();
    // discountedInr should be present
    expect(typeof found.discountedInr).toBe('number');
  });
});
