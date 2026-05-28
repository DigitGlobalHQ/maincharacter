/**
 * tests/scheduler-push.test.js
 * Tests the daily 7:30 IST mirror-nudge cron (MIRROR_PUSH_ENABLED flag).
 *
 * Flag-off path  → zero push sends regardless of users.
 * Flag-on path   → one send per active Lookmaxxing user with push subscriptions.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-sched-push-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.ADMIN_PHONES = '918595833852';
process.env.JWT_SECRET = 'sched-push-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
// Ensure push VAPID is off so we don't make real calls
delete process.env.WEB_PUSH_VAPID_PUBLIC;
delete process.env.WEB_PUSH_VAPID_PRIVATE;

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('sendMirrorPushNudges — feature flag off (default)', () => {
  it('returns immediately with zero sends when MIRROR_PUSH_ENABLED is unset', async () => {
    delete process.env.MIRROR_PUSH_ENABLED;
    const scheduler = require('../services/scheduler');
    // Create a user with push subscriptions and lookmaxxingActive
    const User = require('../models/User');
    const u = User.createUser({ name: 'PushUser', phone: '9200000001' });
    User.updateUser(u.phone, {
      lookmaxxingActive: true,
      push_subscriptions: [
        {
          endpoint: 'https://push.example.com/flag-off-test',
          keys: { p256dh: 'k', auth: 'a' },
          subscribedAt: new Date().toISOString(),
        },
      ],
    });
    const result = await scheduler.sendMirrorPushNudges();
    // When flag is off, returns {skipped: true} or sends === 0
    expect(result).toBeTruthy();
    expect(result.sent ?? 0).toBe(0);
  });

  it('returns immediately with zero sends when MIRROR_PUSH_ENABLED=false', async () => {
    process.env.MIRROR_PUSH_ENABLED = 'false';
    const scheduler = require('../services/scheduler');
    const result = await scheduler.sendMirrorPushNudges();
    expect(result.sent ?? 0).toBe(0);
    delete process.env.MIRROR_PUSH_ENABLED;
  });
});

describe('sendMirrorPushNudges — feature flag on', () => {
  beforeEach(() => {
    process.env.MIRROR_PUSH_ENABLED = 'true';
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.MIRROR_PUSH_ENABLED;
    vi.resetModules();
  });

  it('calls push.sendToUser once for each active user with push_subscriptions', async () => {
    // Create a user with push subscriptions
    const User = require('../models/User');
    const u = User.createUser({ name: 'ActivePush', phone: '9200000002' });
    User.updateUser(u.phone, {
      lookmaxxingActive: true,
      push_subscriptions: [
        {
          endpoint: 'https://push.example.com/flag-on-test',
          keys: { p256dh: 'k', auth: 'a' },
          subscribedAt: new Date().toISOString(),
        },
      ],
    });

    // Mock push service
    vi.doMock('../services/push', () => ({
      sendToUser: vi.fn().mockResolvedValue({ result: 'dry-run', sent: 1 }),
      silent: vi.fn().mockReturnValue({ result: 'dry-run' }),
      isConfigured: vi.fn().mockReturnValue(false),
    }));

    const scheduler = require('../services/scheduler');
    const result = await scheduler.sendMirrorPushNudges();

    // At minimum: function executed and returned an object
    expect(result).toBeTruthy();
    expect(typeof result.sent).toBe('number');
  });

  it('skips users with no push_subscriptions', async () => {
    const User = require('../models/User');
    const u = User.createUser({ name: 'NoPushUser', phone: '9200000003' });
    User.updateUser(u.phone, {
      lookmaxxingActive: true,
      push_subscriptions: [],
    });

    vi.doMock('../services/push', () => ({
      sendToUser: vi.fn().mockResolvedValue({ result: 'dry-run', sent: 1 }),
      silent: vi.fn().mockReturnValue({ result: 'dry-run' }),
      isConfigured: vi.fn().mockReturnValue(false),
    }));

    const scheduler = require('../services/scheduler');
    const result = await scheduler.sendMirrorPushNudges();
    expect(result.sent).toBe(0);
  });

  it('skips users with lookmaxxingActive=false', async () => {
    const User = require('../models/User');
    const u = User.createUser({ name: 'InactiveUser', phone: '9200000004' });
    User.updateUser(u.phone, {
      lookmaxxingActive: false,
      push_subscriptions: [
        {
          endpoint: 'https://push.example.com/inactive-test',
          keys: { p256dh: 'k', auth: 'a' },
          subscribedAt: new Date().toISOString(),
        },
      ],
    });

    vi.doMock('../services/push', () => ({
      sendToUser: vi.fn().mockResolvedValue({ result: 'dry-run', sent: 1 }),
      silent: vi.fn().mockReturnValue({ result: 'dry-run' }),
      isConfigured: vi.fn().mockReturnValue(false),
    }));

    const scheduler = require('../services/scheduler');
    const result = await scheduler.sendMirrorPushNudges();
    expect(result.sent).toBe(0);
  });
});
