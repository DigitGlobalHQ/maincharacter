/**
 * tests/activity-feed.test.js
 * Unit tests for lib/activity-feed.js — threaded Slack user-activity feed.
 *
 * Tests:
 *  - DRY-RUN: resolves without throwing, no axios.post when unconfigured
 *  - Threaded mode: userSignedUp posts chat.postMessage, captures ts, calls
 *    User.updateUser with { activityThreadTs }
 *  - Thread reply: userActivity posts with thread_ts from activityThreadTs
 *  - Idempotent parent: second userSignedUp with activityThreadTs already set
 *    does NOT post again
 *  - Comp users skipped (no axios.post)
 *  - Flat fallback (only SLACK_ACTIVITY_WEBHOOK_URL): posts to webhook, no thread_ts
 *  - Never throws when axios rejects
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// ── Isolate to a tmp dir ─────────────────────────────────────────────────────
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-actfeed-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
process.env.EVENTS_BACKEND = 'file';
process.env.EVENTS_JSONL_PATH = path.join(tmpDir, 'events.jsonl');

// Clean env so we start unconfigured
delete process.env.SLACK_BOT_TOKEN;
delete process.env.SLACK_ACTIVITY_CHANNEL;
delete process.env.SLACK_ACTIVITY_WEBHOOK_URL;

const axios = require('axios');
const User = require('../models/User');

// ── Save / restore env between tests ────────────────────────────────────────
const ORIG_ENV = {};
const ENV_KEYS = ['SLACK_BOT_TOKEN', 'SLACK_ACTIVITY_CHANNEL', 'SLACK_ACTIVITY_WEBHOOK_URL'];

beforeEach(() => {
  ENV_KEYS.forEach(k => { ORIG_ENV[k] = process.env[k]; });
  vi.restoreAllMocks();
  vi.spyOn(axios, 'post');
});
afterEach(() => {
  ENV_KEYS.forEach(k => {
    if (ORIG_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIG_ENV[k];
  });
  vi.restoreAllMocks();
});

// afterAll: clean tmp
import { afterAll } from 'vitest';
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

// Helper: fresh user object (not stored — pure JS object for testing)
function makeUser(overrides = {}) {
  return {
    phone: '919900000001',
    name: 'Test User',
    email: 'test@example.test',
    token: 'tok-abc',
    comp: false,
    activityThreadTs: null,
    ...overrides,
  };
}

// We lazy-require activity-feed inside tests so env changes before require take effect.
// For the module to pick up env changes we need to use a fresh require each group.
// Vitest runs CJS requires, so we reset the module by clearing the cache.
function freshFeed() {
  // Delete cached copy so env is re-read.
  const key = require.resolve('../lib/activity-feed');
  delete require.cache[key];
  return require('../lib/activity-feed');
}

// ──────────────────────────────────────────────────────────────────────────────
describe('isConfigured()', () => {
  it('returns false when no env vars are set', () => {
    const feed = freshFeed();
    expect(feed.isConfigured()).toBe(false);
  });

  it('returns true when SLACK_BOT_TOKEN + SLACK_ACTIVITY_CHANNEL are set', () => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-test';
    process.env.SLACK_ACTIVITY_CHANNEL = 'C0TEST';
    const feed = freshFeed();
    expect(feed.isConfigured()).toBe(true);
  });

  it('returns true when only SLACK_ACTIVITY_WEBHOOK_URL is set (flat fallback)', () => {
    process.env.SLACK_ACTIVITY_WEBHOOK_URL = 'https://hooks.slack.com/test';
    const feed = freshFeed();
    expect(feed.isConfigured()).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('DRY-RUN (no env vars set)', () => {
  it('userSignedUp resolves without throwing and makes no axios.post', async () => {
    const feed = freshFeed();
    const user = makeUser();
    await expect(feed.userSignedUp(user)).resolves.toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('userActivity resolves without throwing and makes no axios.post', async () => {
    const feed = freshFeed();
    const user = makeUser();
    await expect(feed.userActivity(user, { event: 'payment_succeeded', props: {} })).resolves.toBeUndefined();
    expect(axios.post).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('threaded mode (SLACK_BOT_TOKEN + SLACK_ACTIVITY_CHANNEL)', () => {
  const BOT_TOKEN = 'xoxb-mock-token';
  const CHANNEL = 'C0ACTIVITY';

  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = BOT_TOKEN;
    process.env.SLACK_ACTIVITY_CHANNEL = CHANNEL;
    delete process.env.SLACK_ACTIVITY_WEBHOOK_URL;
  });

  it('userSignedUp POSTs to chat.postMessage with correct auth header and channel', async () => {
    axios.post.mockResolvedValue({ data: { ok: true, ts: '111.222' } });
    const feed = freshFeed();
    const user = makeUser({ phone: '919900001001' });

    // Ensure user exists in the store so updateUser can find them
    User.createUser({ name: user.name, phone: user.phone });

    await feed.userSignedUp(user);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, config] = axios.post.mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(body.channel).toBe(CHANNEL);
    expect(typeof body.text).toBe('string');
    expect(body.text.length).toBeGreaterThan(0);
    expect(body.thread_ts).toBeUndefined(); // parent message has no thread_ts
    expect(config.headers['Authorization']).toBe(`Bearer ${BOT_TOKEN}`);
  });

  it('userSignedUp captures ts from response and persists activityThreadTs on user', async () => {
    axios.post.mockResolvedValue({ data: { ok: true, ts: '111.222' } });
    const feed = freshFeed();
    const phone = '919900001002';
    User.createUser({ name: 'Persist Test', phone });
    const user = makeUser({ phone });

    await feed.userSignedUp(user);

    const updated = User.getUserByPhone(phone);
    expect(updated.activityThreadTs).toBe('111.222');
  });

  it('userSignedUp includes name and email in parent message text', async () => {
    axios.post.mockResolvedValue({ data: { ok: true, ts: '222.333' } });
    const feed = freshFeed();
    const phone = '919900001003';
    User.createUser({ name: 'Aarav Test', phone });
    const user = makeUser({ phone, name: 'Aarav Test', email: 'aarav@example.test' });

    await feed.userSignedUp(user);

    const [, body] = axios.post.mock.calls[0];
    expect(body.text).toContain('Aarav Test');
    expect(body.text).toContain('aarav@example.test');
  });

  it('userActivity posts with thread_ts matching activityThreadTs', async () => {
    axios.post.mockResolvedValue({ data: { ok: true, ts: '333.444' } });
    const feed = freshFeed();
    const phone = '919900001004';
    User.createUser({ name: 'Reply Test', phone });
    // Pre-set activityThreadTs so we can test the reply path
    User.updateUser(phone, { activityThreadTs: '999.000' });
    const user = { ...makeUser({ phone }), activityThreadTs: '999.000' };

    await feed.userActivity(user, { event: 'payment_succeeded', props: { amount: 9900 } });

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toBe('https://slack.com/api/chat.postMessage');
    expect(body.thread_ts).toBe('999.000');
  });

  it('userActivity with payment event includes green color attachment', async () => {
    axios.post.mockResolvedValue({ data: { ok: true, ts: '400.001' } });
    const feed = freshFeed();
    const phone = '919900001005';
    User.createUser({ name: 'Pay Color', phone });
    User.updateUser(phone, { activityThreadTs: '888.000' });
    const user = { ...makeUser({ phone }), activityThreadTs: '888.000' };

    await feed.userActivity(user, { event: 'payment_succeeded', props: {} });

    const [, body] = axios.post.mock.calls[0];
    // payment events use an attachment with color:'good'
    const att = body.attachments && body.attachments[0];
    expect(att).toBeDefined();
    expect(att.color).toBe('good');
  });

  it('idempotent: userSignedUp does NOT post when activityThreadTs already set', async () => {
    axios.post.mockResolvedValue({ data: { ok: true, ts: '555.000' } });
    const feed = freshFeed();
    const user = makeUser({ activityThreadTs: '123.456' });

    await feed.userSignedUp(user);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('lazy parent creation: userActivity with no activityThreadTs creates parent then replies', async () => {
    // First call: parent post returns ts '777.001'; second call: thread reply
    axios.post
      .mockResolvedValueOnce({ data: { ok: true, ts: '777.001' } })
      .mockResolvedValueOnce({ data: { ok: true, ts: '777.002' } });

    const feed = freshFeed();
    const phone = '919900001006';
    User.createUser({ name: 'Lazy Parent', phone });
    const user = makeUser({ phone, activityThreadTs: null });

    await feed.userActivity(user, { event: 'mirror_taken', props: { streak: 3 } });

    expect(axios.post).toHaveBeenCalledTimes(2);
    // First call: parent (no thread_ts)
    expect(axios.post.mock.calls[0][1].thread_ts).toBeUndefined();
    // Second call: reply with thread_ts = ts from first call
    expect(axios.post.mock.calls[1][1].thread_ts).toBe('777.001');
  });

  it('non-curated event is silently skipped (not in ACTIVITY_EVENTS map)', async () => {
    const feed = freshFeed();
    const user = makeUser({ activityThreadTs: '100.000' });

    await feed.userActivity(user, { event: 'landing_viewed', props: {} });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('never throws when axios rejects', async () => {
    axios.post.mockRejectedValue(new Error('Slack is down'));
    const feed = freshFeed();
    const phone = '919900001007';
    User.createUser({ name: 'Resilient', phone });
    const user = makeUser({ phone });

    await expect(feed.userSignedUp(user)).resolves.toBeUndefined();
  });

  it('swallows ok:false from Slack without throwing', async () => {
    axios.post.mockResolvedValue({ data: { ok: false, error: 'channel_not_found' } });
    const feed = freshFeed();
    const phone = '919900001008';
    User.createUser({ name: 'SlackErr', phone });
    const user = makeUser({ phone });

    await expect(feed.userSignedUp(user)).resolves.toBeUndefined();
    // No ts written when ok:false
    const stored = User.getUserByPhone(phone);
    expect(stored.activityThreadTs || null).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('comp users are skipped', () => {
  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-mock';
    process.env.SLACK_ACTIVITY_CHANNEL = 'C0TEST';
    axios.post.mockResolvedValue({ data: { ok: true, ts: '000.001' } });
  });

  it('userSignedUp with comp=true makes no axios.post', async () => {
    const feed = freshFeed();
    const user = makeUser({ comp: true });
    await feed.userSignedUp(user);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('userActivity with comp=true makes no axios.post', async () => {
    const feed = freshFeed();
    const user = makeUser({ comp: true, activityThreadTs: '100.000' });
    await feed.userActivity(user, { event: 'payment_succeeded', props: {} });
    expect(axios.post).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('flat fallback (SLACK_ACTIVITY_WEBHOOK_URL only)', () => {
  const WEBHOOK_URL = 'https://hooks.slack.com/services/T0/B0/flat';

  beforeEach(() => {
    delete process.env.SLACK_BOT_TOKEN;
    delete process.env.SLACK_ACTIVITY_CHANNEL;
    process.env.SLACK_ACTIVITY_WEBHOOK_URL = WEBHOOK_URL;
    axios.post.mockResolvedValue({ data: 'ok' });
  });

  it('userActivity posts to the webhook URL (not chat.postMessage)', async () => {
    const feed = freshFeed();
    const user = makeUser({ activityThreadTs: null });

    await feed.userActivity(user, { event: 'audit_started', props: {} });

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url] = axios.post.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
  });

  it('flat fallback payload has no thread_ts', async () => {
    const feed = freshFeed();
    const user = makeUser({ activityThreadTs: null });

    await feed.userActivity(user, { event: 'audit_started', props: {} });

    const [, body] = axios.post.mock.calls[0];
    expect(body.thread_ts).toBeUndefined();
  });

  it('userSignedUp also uses the flat fallback', async () => {
    const feed = freshFeed();
    const phone = '919900002001';
    User.createUser({ name: 'Flat Test', phone });
    const user = makeUser({ phone });

    await feed.userSignedUp(user);

    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url] = axios.post.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
  });

  it('flat fallback never throws when axios rejects', async () => {
    axios.post.mockRejectedValue(new Error('network error'));
    const feed = freshFeed();
    const user = makeUser();

    await expect(feed.userActivity(user, { event: 'audit_started', props: {} })).resolves.toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('hook: recordLogin fires userSignedUp on first login only', () => {
  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-hook-test';
    process.env.SLACK_ACTIVITY_CHANNEL = 'C0HOOK';
    axios.post.mockResolvedValue({ data: { ok: true, ts: '999.111' } });
    // Clear module cache so recordLogin re-requires a fresh activity-feed
    const key = require.resolve('../lib/activity-feed');
    delete require.cache[key];
  });

  it('fires userSignedUp once on a google first-login with email present', async () => {
    // Isolate User store for this test group
    const phone = '919900003001';
    User.createUser({ name: 'Hook User', phone });
    const u = User.getUserByPhone(phone);
    // Simulate an email and google provider on the user
    User.updateUser(phone, { email: 'hook@example.test', authProvider: 'google' });
    const freshUser = User.getUserByPhone(phone);

    // Spy on the feed's userSignedUp via the module itself
    const feed = freshFeed();
    const signedUpSpy = vi.spyOn(feed, 'userSignedUp').mockResolvedValue(undefined);

    // Wire the spy: patch the lazy-require in lookmax-auth to return the spied feed
    const lmAuthKey = require.resolve('../lib/lookmax-auth');
    delete require.cache[lmAuthKey];
    // Override require inside recordLogin — inject the spied module
    // We do this by replacing the cached module after loading
    const { recordLogin } = require('../lib/lookmax-auth');

    // Because recordLogin does `require('./activity-feed')` lazily, we patch cache
    require.cache[require.resolve('../lib/activity-feed')] = {
      id: require.resolve('../lib/activity-feed'),
      filename: require.resolve('../lib/activity-feed'),
      loaded: true,
      exports: feed,
      children: [],
      paths: [],
    };

    await recordLogin(freshUser, 'google');
    expect(signedUpSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire userSignedUp on a repeat login (firstLoginAt already set)', async () => {
    const phone = '919900003002';
    User.createUser({ name: 'Repeat Hook', phone });
    User.updateUser(phone, {
      email: 'repeat@example.test',
      authProvider: 'google',
      firstLoginAt: new Date().toISOString(),
    });
    const u = User.getUserByPhone(phone);

    const feed = freshFeed();
    const signedUpSpy = vi.spyOn(feed, 'userSignedUp').mockResolvedValue(undefined);

    const lmAuthKey = require.resolve('../lib/lookmax-auth');
    delete require.cache[lmAuthKey];
    require.cache[require.resolve('../lib/activity-feed')] = {
      id: require.resolve('../lib/activity-feed'),
      filename: require.resolve('../lib/activity-feed'),
      loaded: true,
      exports: feed,
      children: [],
      paths: [],
    };

    const { recordLogin } = require('../lib/lookmax-auth');
    await recordLogin(u, 'google');
    expect(signedUpSpy).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
describe('hook: events._write forwards curated events to userActivity', () => {
  beforeEach(() => {
    process.env.SLACK_BOT_TOKEN = 'xoxb-events-test';
    process.env.SLACK_ACTIVITY_CHANNEL = 'C0EVENTS';
    process.env.EVENTS_BACKEND = 'file';
    axios.post.mockResolvedValue({ data: { ok: true, ts: '444.555' } });
  });

  it('forwards payment_succeeded with a userToken to userActivity (spy)', async () => {
    const phone = '919900004001';
    User.createUser({ name: 'Events Hook', phone });
    User.updateUser(phone, { activityThreadTs: '444.555' });
    const u = User.getUserByPhone(phone);

    const feed = freshFeed();
    const activitySpy = vi.spyOn(feed, 'userActivity').mockResolvedValue(undefined);

    // Clear and re-wire module cache
    const eventsKey = require.resolve('../services/events');
    delete require.cache[eventsKey];
    require.cache[require.resolve('../lib/activity-feed')] = {
      id: require.resolve('../lib/activity-feed'),
      filename: require.resolve('../lib/activity-feed'),
      loaded: true,
      exports: feed,
      children: [],
      paths: [],
    };

    const events = require('../services/events');
    events.track('payment_succeeded', {}, u.token);

    // Give setImmediate / async plumbing time to fire
    await new Promise(r => setTimeout(r, 50));

    expect(activitySpy).toHaveBeenCalledTimes(1);
    const [calledUser, calledOpts] = activitySpy.mock.calls[0];
    expect(calledUser.phone).toBe(phone);
    expect(calledOpts.event).toBe('payment_succeeded');
  });

  it('does NOT forward a non-curated event (landing_viewed)', async () => {
    const phone = '919900004002';
    User.createUser({ name: 'Skip Event', phone });
    const u = User.getUserByPhone(phone);

    const feed = freshFeed();
    const activitySpy = vi.spyOn(feed, 'userActivity').mockResolvedValue(undefined);

    const eventsKey = require.resolve('../services/events');
    delete require.cache[eventsKey];
    require.cache[require.resolve('../lib/activity-feed')] = {
      id: require.resolve('../lib/activity-feed'),
      filename: require.resolve('../lib/activity-feed'),
      loaded: true,
      exports: feed,
      children: [],
      paths: [],
    };

    const events = require('../services/events');
    events.track('landing_viewed', {}, u.token);

    await new Promise(r => setTimeout(r, 50));

    expect(activitySpy).not.toHaveBeenCalled();
  });

  it('does NOT forward an anonymous event (no userToken)', async () => {
    const feed = freshFeed();
    const activitySpy = vi.spyOn(feed, 'userActivity').mockResolvedValue(undefined);

    const eventsKey = require.resolve('../services/events');
    delete require.cache[eventsKey];
    require.cache[require.resolve('../lib/activity-feed')] = {
      id: require.resolve('../lib/activity-feed'),
      filename: require.resolve('../lib/activity-feed'),
      loaded: true,
      exports: feed,
      children: [],
      paths: [],
    };

    const events = require('../services/events');
    events.trackAnonymous('payment_succeeded', {}, 'anon-123');

    await new Promise(r => setTimeout(r, 50));

    expect(activitySpy).not.toHaveBeenCalled();
  });

  it('does NOT forward a curated event for a comp user', async () => {
    const phone = '919900004003';
    User.createUser({ name: 'Comp Events', phone });
    User.updateUser(phone, { comp: true });
    const u = User.getUserByPhone(phone);

    const feed = freshFeed();
    const activitySpy = vi.spyOn(feed, 'userActivity').mockResolvedValue(undefined);

    const eventsKey = require.resolve('../services/events');
    delete require.cache[eventsKey];
    require.cache[require.resolve('../lib/activity-feed')] = {
      id: require.resolve('../lib/activity-feed'),
      filename: require.resolve('../lib/activity-feed'),
      loaded: true,
      exports: feed,
      children: [],
      paths: [],
    };

    const events = require('../services/events');
    events.track('payment_succeeded', {}, u.token);

    await new Promise(r => setTimeout(r, 50));

    expect(activitySpy).not.toHaveBeenCalled();
  });
});
