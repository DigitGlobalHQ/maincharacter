import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

const wati = require('../services/wati');

// Snapshot + restore the env vars the verifier reads, so tests don't leak.
const SAVED = {};
beforeEach(() => {
  for (const k of ['WATI_WEBHOOK_SECRET', 'WATI_WEBHOOK_ALLOWED_IPS']) SAVED[k] = process.env[k];
  delete process.env.WATI_WEBHOOK_SECRET;
  delete process.env.WATI_WEBHOOK_ALLOWED_IPS;
});
afterEach(() => {
  for (const k of ['WATI_WEBHOOK_SECRET', 'WATI_WEBHOOK_ALLOWED_IPS']) {
    if (SAVED[k] === undefined) delete process.env[k];
    else process.env[k] = SAVED[k];
  }
});

const body = { waId: '918000000001', text: 'START NOW' };
const raw = Buffer.from(JSON.stringify(body));
const sign = (secret, payload) =>
  crypto.createHmac('sha256', secret).update(payload).digest('hex');

describe('wati.verifyWebhookRequest (P1.2)', () => {
  it('HMAC mode: accepts a correctly signed request', () => {
    process.env.WATI_WEBHOOK_SECRET = 's3cret';
    const v = wati.verifyWebhookRequest({
      rawBody: raw,
      signature: sign('s3cret', raw),
      ip: '1.2.3.4',
    });
    expect(v).toEqual({ ok: true, mode: 'hmac', reason: undefined });
  });

  it('HMAC mode: rejects a wrong signature', () => {
    process.env.WATI_WEBHOOK_SECRET = 's3cret';
    const v = wati.verifyWebhookRequest({ rawBody: raw, signature: sign('WRONG', raw) });
    expect(v.ok).toBe(false);
    expect(v.mode).toBe('hmac');
  });

  it('HMAC mode: rejects a missing signature', () => {
    process.env.WATI_WEBHOOK_SECRET = 's3cret';
    const v = wati.verifyWebhookRequest({ rawBody: raw });
    expect(v.ok).toBe(false);
    expect(v.reason).toMatch(/missing/);
  });

  it('HMAC mode: falls back to JSON-stringified body when rawBody is absent', () => {
    process.env.WATI_WEBHOOK_SECRET = 's3cret';
    const v = wati.verifyWebhookRequest({ body, signature: sign('s3cret', JSON.stringify(body)) });
    expect(v.ok).toBe(true);
  });

  it('IP mode: accepts an allowlisted IP, rejects others', () => {
    process.env.WATI_WEBHOOK_ALLOWED_IPS = '10.0.0.1, 1.2.3.4';
    expect(wati.verifyWebhookRequest({ body, ip: '1.2.3.4' }).ok).toBe(true);
    const denied = wati.verifyWebhookRequest({ body, ip: '9.9.9.9' });
    expect(denied.ok).toBe(false);
    expect(denied.mode).toBe('ip');
  });

  it('open mode: accepts when neither secret nor IP allowlist is set', () => {
    const v = wati.verifyWebhookRequest({ body });
    expect(v.ok).toBe(true);
    expect(v.mode).toBe('open');
  });

  it('HMAC takes precedence over IP allowlist when both are configured', () => {
    process.env.WATI_WEBHOOK_SECRET = 's3cret';
    process.env.WATI_WEBHOOK_ALLOWED_IPS = '1.2.3.4';
    const v = wati.verifyWebhookRequest({ rawBody: raw, ip: '1.2.3.4' }); // no signature
    expect(v.ok).toBe(false); // HMAC mode wins; missing signature => reject
    expect(v.mode).toBe('hmac');
  });

  it('webhookGuardMode reflects configured strategy', () => {
    expect(wati.webhookGuardMode()).toBe('open');
    process.env.WATI_WEBHOOK_ALLOWED_IPS = '1.2.3.4';
    expect(wati.webhookGuardMode()).toBe('ip');
    process.env.WATI_WEBHOOK_SECRET = 's3cret';
    expect(wati.webhookGuardMode()).toBe('hmac');
  });
});
