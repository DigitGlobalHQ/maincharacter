import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'node:crypto';

// Spy on the shared axios singleton's `post` (the service calls `axios.post(...)`
// by property at call time, so the spy is seen). This is more reliable than
// vi.mock for a CommonJS `require('axios')` consumer.
const axios = require('axios');
const whatsapp = require('../services/whatsapp');

const ORIG = { ...process.env };
const ADMIN = '919958533994';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(axios, 'post');
  // Reset the env surface the service + guard read.
  for (const k of [
    'WHATSAPP_SEND_MODE',
    'WATI_SEND_MODE',
    'WHATSAPP_ALLOWLIST',
    'WATI_ALLOWLIST',
    'WHATSAPP_ACCESS_TOKEN',
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_APP_SECRET',
    'WHATSAPP_VERIFY_TOKEN',
  ]) {
    delete process.env[k];
  }
  process.env.ADMIN_PHONE = ADMIN;
});

afterEach(() => {
  process.env = { ...ORIG };
});

/** Put the service into a fully-configured, send-to-anyone state. */
function configureLive() {
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '111222';
  process.env.WHATSAPP_SEND_MODE = 'all';
}

describe('sendMessage — guards', () => {
  it('mode=off suppresses without an API call', async () => {
    process.env.WHATSAPP_SEND_MODE = 'off';
    const r = await whatsapp.sendMessage(ADMIN, 'hi');
    expect(r.result).toBe('suppressed');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('mode=allowlist blocks a non-admin number', async () => {
    process.env.WHATSAPP_SEND_MODE = 'allowlist';
    configureCreds();
    const r = await whatsapp.sendMessage('911234567890', 'hi');
    expect(r.result).toBe('blocked');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('mode=allowlist + admin + missing creds → dry-run', async () => {
    process.env.WHATSAPP_SEND_MODE = 'allowlist';
    const r = await whatsapp.sendMessage(ADMIN, 'hi');
    expect(r.result).toBe('dry-run');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('DRY-RUN when credentials missing even in mode=all', async () => {
    process.env.WHATSAPP_SEND_MODE = 'all';
    const r = await whatsapp.sendMessage('911234567890', 'hi');
    expect(r.result).toBe('dry-run');
    expect(axios.post).not.toHaveBeenCalled();
  });
});

function configureCreds() {
  process.env.WHATSAPP_ACCESS_TOKEN = 'tok';
  process.env.WHATSAPP_PHONE_NUMBER_ID = '111222';
}

describe('sendMessage — live (mocked axios)', () => {
  it('posts to the Graph messages endpoint with a text body', async () => {
    configureLive();
    axios.post.mockResolvedValueOnce({ status: 200, data: { messages: [{ id: 'wamid.1' }] } });
    const r = await whatsapp.sendMessage('9958533994', 'hello there');
    expect(r.messages[0].id).toBe('wamid.1');
    expect(axios.post).toHaveBeenCalledTimes(1);
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toContain('/111222/messages');
    expect(body).toMatchObject({ messaging_product: 'whatsapp', to: '919958533994', type: 'text' });
    expect(body.text.body).toBe('hello there');
    expect(opts.headers.Authorization).toBe('Bearer tok');
  });
});

describe('sendMessageSafe — retry semantics', () => {
  it('retries once then succeeds', async () => {
    configureLive();
    axios.post
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ status: 200, data: { ok: true } });
    const r = await whatsapp.sendMessageSafe(ADMIN, 'hi');
    expect(r).toEqual({ ok: true });
    expect(axios.post).toHaveBeenCalledTimes(2);
  });

  it('returns null after a double failure', async () => {
    configureLive();
    axios.post.mockRejectedValue(new Error('down'));
    const r = await whatsapp.sendMessageSafe(ADMIN, 'hi');
    expect(r).toBeNull();
    expect(axios.post).toHaveBeenCalledTimes(2);
  });
});

describe('sendTemplateMessage', () => {
  it('posts a template payload with positional body params', async () => {
    configureLive();
    axios.post.mockResolvedValueOnce({ status: 200, data: { messages: [{ id: 't1' }] } });
    await whatsapp.sendTemplateMessage('9958533994', 'welcome', ['Mira']);
    const [, body] = axios.post.mock.calls[0];
    expect(body.type).toBe('template');
    expect(body.template.name).toBe('welcome');
    expect(body.template.language.code).toBe('en');
    expect(body.template.components[0].parameters[0]).toEqual({ type: 'text', text: 'Mira' });
  });

  it('respects the send-mode guard (off → suppressed, no call)', async () => {
    process.env.WHATSAPP_SEND_MODE = 'off';
    const r = await whatsapp.sendTemplateMessage(ADMIN, 'welcome', []);
    expect(r.result).toBe('suppressed');
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('verifyWebhookSignature (x-hub-signature-256)', () => {
  const raw = Buffer.from(JSON.stringify({ entry: [{ id: '1' }] }));
  const sign = (secret, payload) =>
    'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');

  it('accepts a correctly signed request', () => {
    process.env.WHATSAPP_APP_SECRET = 'appsecret';
    const v = whatsapp.verifyWebhookSignature(raw, sign('appsecret', raw));
    expect(v).toEqual({ ok: true, mode: 'hmac', reason: undefined });
  });

  it('rejects a wrong signature', () => {
    process.env.WHATSAPP_APP_SECRET = 'appsecret';
    const v = whatsapp.verifyWebhookSignature(raw, sign('WRONG', raw));
    expect(v.ok).toBe(false);
    expect(v.mode).toBe('hmac');
  });

  it('rejects a missing signature when a secret is set', () => {
    process.env.WHATSAPP_APP_SECRET = 'appsecret';
    const v = whatsapp.verifyWebhookSignature(raw, undefined);
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/missing/);
  });

  it('open mode: accepts when no app secret is configured', () => {
    const v = whatsapp.verifyWebhookSignature(raw, undefined);
    expect(v.ok).toBe(true);
    expect(v.mode).toBe('open');
    expect(whatsapp.webhookGuardMode()).toBe('open');
  });
});

describe('verifyWebhookChallenge (GET handshake)', () => {
  it('echoes the challenge when mode + token match', () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
    expect(whatsapp.verifyWebhookChallenge('subscribe', 'verify-me', 'CHAL123')).toBe('CHAL123');
  });

  it('returns null on a token mismatch', () => {
    process.env.WHATSAPP_VERIFY_TOKEN = 'verify-me';
    expect(whatsapp.verifyWebhookChallenge('subscribe', 'nope', 'CHAL123')).toBeNull();
  });

  it('returns null when no verify token is configured', () => {
    expect(whatsapp.verifyWebhookChallenge('subscribe', '', 'CHAL123')).toBeNull();
  });
});

describe('isConfigured', () => {
  it('false without creds, true with token + phone id', () => {
    expect(whatsapp.isConfigured()).toBe(false);
    configureCreds();
    expect(whatsapp.isConfigured()).toBe(true);
  });
});
