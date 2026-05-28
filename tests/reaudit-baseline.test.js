/**
 * tests/reaudit-baseline.test.js
 *
 * Verifies that payment activation captures lookmaxBaseline correctly, and
 * that the snapshot survives an AuditSession purge (the 24h TTL expiry).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// ── Isolated temp store ─────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-reaudit-baseline-'));
process.env.USERS_FILE_PATH        = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH     = path.join(tmpDir, 'waitlist.json');
process.env.AUDIT_SESSIONS_FILE_PATH = path.join(tmpDir, 'audit-sessions.json');
process.env.LOOKMAX_FILE_PATH      = path.join(tmpDir, 'lookmax.json');
process.env.WHATSAPP_SEND_MODE     = 'off';
process.env.JWT_SECRET             = 'baseline-test-secret';
delete process.env.GEMINI_API_KEY;
delete process.env.DATABASE_URL;

const User         = require('../models/User');
const AuditSession = require('../models/AuditSession');

const SAMPLE_SCORES = {
  skinClarity: 72, jawDefinition: 58, eyeArea: 65, hairDensity: 70,
  posture: 80, facialHarmony: 63, expression: 55, bodyComposition: 68,
};

// Minimal processPaymentEvent import — lazy after env is set.
let processPaymentEvent;
beforeAll(async () => {
  // Lazily import after env is configured so the model layer sees the correct paths.
  ({ processPaymentEvent } = require('../routes/api'));
});

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

// ── helpers ─────────────────────────────────────────────────────────

function makeSession(overrides = {}) {
  const s = AuditSession.createSession({ intent: 'lookmaxxing' });
  AuditSession.updateSession(s.sessionToken, {
    aestheticScores: SAMPLE_SCORES,
    weakestAxis: 'jawDefinition',
    completedAt: new Date().toISOString(),
    ...overrides,
  });
  return s;
}

function makeUser(phone, overrides = {}) {
  const u = User.createUser({ name: 'Test User', phone, pillar: 'orator' });
  User.updateUser(phone, { email: null, ...overrides });
  return User.getUserByPhone(phone);
}

function makeActivationEvent(phone, sessionToken, pillar = 'lookmaxxing') {
  return {
    event: 'subscription.activated',
    payload: {
      subscription: {
        entity: {
          id: 'sub_test_123',
          notes: { phone, pillars: pillar, plan: 'lookmaxxing-monthly-1499' },
        },
      },
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────

describe('lookmaxBaseline capture at subscription.activated', () => {
  it('snapshots aestheticScores + metadata from AuditSession onto user record', async () => {
    const phone = '919000000001';
    const session = makeSession();
    makeUser(phone, { auditSessionId: session.sessionToken });

    const evt = makeActivationEvent(phone, session.sessionToken);
    evt.payload.subscription.entity.notes.phone = phone;
    await processPaymentEvent(evt);

    const user = User.getUserByPhone(phone);
    expect(user.lookmaxxingActive).toBe(true);
    expect(user.lookmaxBaseline).not.toBeNull();
    expect(user.lookmaxBaseline.scores).toEqual(SAMPLE_SCORES);
    expect(user.lookmaxBaseline.leverageAxis).toBe('jawDefinition');
    expect(typeof user.lookmaxBaseline.overall).toBe('number');
    expect(user.lookmaxBaseline.overall).toBeGreaterThan(0);
    expect(user.lookmaxBaseline.capturedAt).toBeTruthy();
  });

  it('baseline survives after AuditSession is purged (TTL expired)', async () => {
    const phone = '919000000002';
    const session = makeSession();
    makeUser(phone, { auditSessionId: session.sessionToken });

    // Capture baseline via activation
    const evt = makeActivationEvent(phone, session.sessionToken);
    evt.payload.subscription.entity.notes.phone = phone;
    await processPaymentEvent(evt);

    // Simulate session expiry: purge the sessions file
    fs.writeFileSync(process.env.AUDIT_SESSIONS_FILE_PATH, '{}');

    // User's baseline must still be intact on the user record
    const user = User.getUserByPhone(phone);
    expect(user.lookmaxBaseline).not.toBeNull();
    expect(user.lookmaxBaseline.scores).toEqual(SAMPLE_SCORES);
  });

  it('does not overwrite an existing baseline on re-activation', async () => {
    const phone = '919000000003';
    const session = makeSession();
    const preExistingBaseline = {
      scores: { skinClarity: 90 },
      leverageAxis: 'posture',
      overall: 90,
      capturedAt: '2026-01-01T00:00:00.000Z',
      photoStorageKeys: {},
    };
    makeUser(phone, { auditSessionId: session.sessionToken, lookmaxBaseline: preExistingBaseline });

    // Trigger a second activation
    const evt = makeActivationEvent(phone, session.sessionToken);
    evt.payload.subscription.entity.notes.phone = phone;
    await processPaymentEvent(evt);

    // The pre-existing baseline must NOT be overwritten
    const user = User.getUserByPhone(phone);
    expect(user.lookmaxBaseline.scores.skinClarity).toBe(90);
    expect(user.lookmaxBaseline.capturedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('gracefully skips baseline capture when no auditSessionId on user', async () => {
    const phone = '919000000004';
    makeUser(phone, { auditSessionId: null });

    const evt = makeActivationEvent(phone, null);
    evt.payload.subscription.entity.notes.phone = phone;
    await processPaymentEvent(evt);

    // Must still activate, just without a baseline
    const user = User.getUserByPhone(phone);
    expect(user.lookmaxxingActive).toBe(true);
    expect(user.lookmaxBaseline).toBeFalsy();
  });

  it('captures photoStorageKeys from AuditSession photos when present', async () => {
    const phone = '919000000005';
    const session = makeSession();
    // Add photo records to the session
    AuditSession.updateSession(session.sessionToken, {
      photos: [
        { kind: 'front', storageKey: 'r2:audit/tok/baseline-front.jpg', mimeType: 'image/jpeg', backend: 'r2' },
        { kind: 'side',  storageKey: 'r2:audit/tok/baseline-side.jpg',  mimeType: 'image/jpeg', backend: 'r2' },
        { kind: 'body',  storageKey: 'r2:audit/tok/baseline-body.jpg',  mimeType: 'image/jpeg', backend: 'r2' },
      ],
    });
    makeUser(phone, { auditSessionId: session.sessionToken });

    const evt = makeActivationEvent(phone, session.sessionToken);
    evt.payload.subscription.entity.notes.phone = phone;
    await processPaymentEvent(evt);

    const user = User.getUserByPhone(phone);
    expect(user.lookmaxBaseline.photoStorageKeys).toBeTruthy();
    expect(user.lookmaxBaseline.photoStorageKeys.front).toBe('r2:audit/tok/baseline-front.jpg');
    expect(user.lookmaxBaseline.photoStorageKeys.side).toBe('r2:audit/tok/baseline-side.jpg');
    expect(user.lookmaxBaseline.photoStorageKeys.body).toBe('r2:audit/tok/baseline-body.jpg');
  });
});
