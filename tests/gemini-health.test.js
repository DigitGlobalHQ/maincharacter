import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import geminiHealth from '../lib/gemini-health.js';

const { probe, getStatus, classifyError, _reset } = geminiHealth;
const alerts = require('../lib/alerts');

describe('gemini-health classifyError', () => {
  it('detects a leaked key', () => {
    expect(classifyError(new Error('[403 Forbidden] Your API key was reported as leaked'))).toBe('leaked');
  });
  it('detects rate limiting', () => {
    expect(classifyError({ status: 429, message: 'Too Many Requests' })).toBe('rate_limited');
    expect(classifyError(new Error('RESOURCE_EXHAUSTED'))).toBe('rate_limited');
  });
  it('detects an invalid key', () => {
    expect(classifyError({ status: 403, message: 'permission denied' })).toBe('invalid_key');
    expect(classifyError(new Error('API key not valid'))).toBe('invalid_key');
  });
  it('falls back to generic error', () => {
    expect(classifyError(new Error('network unreachable'))).toBe('error');
  });
});

describe('gemini-health probe', () => {
  const origKey = process.env.GEMINI_API_KEY;
  beforeEach(() => { _reset(); });
  afterEach(() => {
    if (origKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = origKey;
  });

  it('reports unconfigured when no key is set', async () => {
    delete process.env.GEMINI_API_KEY;
    const snap = await probe();
    expect(snap.status).toBe('unconfigured');
  });

  it('reports ok when the model responds', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const fakeModel = { generateContent: async () => ({ response: { text: () => 'pong' } }) };
    const snap = await probe(fakeModel);
    expect(snap.status).toBe('ok');
    expect(snap.checkedAt).toBeTruthy();
  });

  it('reports leaked when the model throws a leaked-key error', async () => {
    process.env.GEMINI_API_KEY = 'leaked-key';
    const fakeModel = { generateContent: async () => { throw new Error('[403 Forbidden] Your API key was reported as leaked.'); } };
    const snap = await probe(fakeModel);
    expect(snap.status).toBe('leaked');
    expect(snap.detail).toContain('leaked');
  });

  it('getStatus returns a snapshot synchronously', () => {
    const s = getStatus();
    expect(s).toHaveProperty('status');
  });

  it('sends a recovery notice when a previously-firing condition recovers', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.SLACK_WEBHOOK_URL; // dry-run is fine — we assert the call, not the POST
    alerts._resetThrottle();
    // Simulate the rate-limit condition having fired.
    await alerts.notify({ severity: 'warning', title: 'Gemini key rate limited', detail: '429', key: 'gemini-key-rate_limited' });

    const resolveSpy = vi.spyOn(alerts, 'resolve');
    const okModel = { generateContent: async () => ({ response: { text: () => 'pong' } }) };
    const snap = await probe(okModel);

    expect(snap.status).toBe('ok');
    const resolvedKeys = resolveSpy.mock.calls.map((c) => c[0] && c[0].key);
    expect(resolvedKeys).toContain('gemini-key-rate_limited');
    resolveSpy.mockRestore();
  });

  it('does not send a recovery notice on a healthy probe when nothing was firing', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.SLACK_WEBHOOK_URL;
    alerts._resetThrottle(); // no firing conditions
    const axios = require('axios');
    const postSpy = vi.spyOn(axios, 'post');
    process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/TEST/HOOK/URL';
    const okModel = { generateContent: async () => ({ response: { text: () => 'pong' } }) };
    await probe(okModel);
    expect(postSpy).not.toHaveBeenCalled(); // resolve() is a no-op → no Slack POST
    postSpy.mockRestore();
    delete process.env.SLACK_WEBHOOK_URL;
  });
});
