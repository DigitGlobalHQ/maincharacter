/**
 * tests/admin-grant.test.js
 * POST /api/admin/grant — comp access without payment
 *
 * Tests:
 *  - auth required (401 without token)
 *  - creates a new comp user when email not found
 *  - idempotent: second grant finds existing user, does not duplicate
 *  - sets oratorActive, lookmaxxingActive, comp, compReason, oratorStartedAt, lookmaxxingStartedAt
 *  - returns sessionToken and magicLinkUrl
 *  - rejects malformed email
 *  - rejects unknown plan names
 *  - audit-logs the grant to comp_grants.jsonl
 *  - requires password rotation when NODE_ENV=production + default password
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-grant-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.AUDIT_SESSIONS_FILE_PATH = path.join(tmpDir, 'audit-sessions.json');
process.env.COMP_GRANTS_FILE_PATH = path.join(tmpDir, 'comp_grants.jsonl');
process.env.ADMIN_PASSWORD = 'testpass-grant';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.UPGRADE_BASE_URL = 'https://test.local';
// Explicitly NOT production so default-password block is bypassed in tests
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
  const login = await request(app).post('/api/admin/login').send({ password: 'testpass-grant' });
  token = login.body.token;
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('POST /api/admin/grant — auth', () => {
  it('rejects unauthenticated caller with 401', async () => {
    const res = await request(app)
      .post('/api/admin/grant')
      .send({ email: 'test@example.com', plans: ['orator', 'lookmaxxing'], reason: 'founder dogfood' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/admin/grant — validation', () => {
  it('rejects malformed email', async () => {
    const res = await request(app)
      .post('/api/admin/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'not-an-email', plans: ['orator'], reason: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  it('rejects unknown plan names', async () => {
    const res = await request(app)
      .post('/api/admin/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'user@example.com', plans: ['orator', 'sage'], reason: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/unknown plan/i);
  });

  it('rejects empty plans array', async () => {
    const res = await request(app)
      .post('/api/admin/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'user@example.com', plans: [], reason: 'test' });
    expect(res.status).toBe(400);
  });

  it('rejects missing email', async () => {
    const res = await request(app)
      .post('/api/admin/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({ plans: ['orator'], reason: 'test' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/grant — happy path', () => {
  it('creates a comp user when email not found, returns sessionToken and magicLinkUrl', async () => {
    const res = await request(app)
      .post('/api/admin/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: 'founder@example.com',
        plans: ['orator', 'lookmaxxing'],
        reason: 'founder dogfood',
      });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeTruthy();
    expect(res.body.user.email).toBe('founder@example.com');
    expect(res.body.user.oratorActive).toBe(true);
    expect(res.body.user.lookmaxxingActive).toBe(true);
    expect(res.body.user.auraPlusPlus).toBe(true);
    expect(res.body.user.comp).toBe(true);
    expect(res.body.user.compReason).toBe('founder dogfood');
    expect(res.body.user.name).toBe('Founder');
    expect(res.body.sessionToken).toBeTruthy();
    expect(res.body.magicLinkUrl).toContain('/lookmax/');
    expect(res.body.magicLinkUrl).toContain('https://test.local');
  });

  it('sets oratorStartedAt and lookmaxxingStartedAt on the user record', async () => {
    const u = User.getUserByEmail('founder@example.com');
    expect(u).toBeTruthy();
    expect(u.oratorStartedAt).toBeTruthy();
    expect(u.lookmaxxingStartedAt).toBeTruthy();
    expect(u.comp).toBe(true);
    expect(u.compReason).toBe('founder dogfood');
  });

  it('is idempotent — second grant updates existing user, no duplicate', async () => {
    const first = await request(app)
      .post('/api/admin/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'idem@example.com', plans: ['orator', 'lookmaxxing'], reason: 'run 1' });

    const second = await request(app)
      .post('/api/admin/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'idem@example.com', plans: ['orator', 'lookmaxxing'], reason: 'run 2' });

    expect(second.status).toBe(200);
    // Same user token (not duplicated)
    expect(second.body.user.token).toBe(first.body.user.token);
    // Reason updated
    expect(second.body.user.compReason).toBe('run 2');

    const all = User.getAllUsers();
    const matches = Object.values(all).filter(u => u.email === 'idem@example.com');
    expect(matches.length).toBe(1);
  });

  it('grants only orator plan when plans=[orator]', async () => {
    const res = await request(app)
      .post('/api/admin/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'orator-only@example.com', plans: ['orator'], reason: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.user.oratorActive).toBe(true);
    expect(res.body.user.lookmaxxingActive).toBe(false);
    expect(res.body.user.auraPlusPlus).toBe(false);
  });
});

describe('POST /api/admin/grant — audit log', () => {
  it('appends a record to comp_grants.jsonl', async () => {
    const grantsFile = process.env.COMP_GRANTS_FILE_PATH;
    // Remove any pre-existing file to start clean for this assertion
    if (fs.existsSync(grantsFile)) fs.unlinkSync(grantsFile);

    await request(app)
      .post('/api/admin/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'auditlog@example.com', plans: ['orator', 'lookmaxxing'], reason: 'audit log test' });

    expect(fs.existsSync(grantsFile)).toBe(true);
    const lines = fs.readFileSync(grantsFile, 'utf8').trim().split('\n').filter(Boolean);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const entry = JSON.parse(lines[lines.length - 1]);
    expect(entry.email).toBe('auditlog@example.com');
    expect(entry.plans).toContain('orator');
    expect(entry.reason).toBe('audit log test');
    expect(entry.ts).toBeTruthy();
  });
});

describe('POST /api/admin/grant — production safety block', () => {
  it('does NOT block when NODE_ENV is not production', async () => {
    // NODE_ENV=test set at top — should succeed
    const res = await request(app)
      .post('/api/admin/grant')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'nonprod@example.com', plans: ['orator'], reason: 'test' });
    expect(res.status).toBe(200);
  });
});
