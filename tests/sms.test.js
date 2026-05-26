import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Spy on the shared axios singleton (the service calls axios.post by property).
const axios = require('axios');
const sms = require('../services/sms');

const ORIG = { ...process.env };
const ADMIN = '919958533994';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(axios, 'post');
  for (const k of ['WHATSAPP_SEND_MODE', 'WATI_SEND_MODE', 'MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID_OTP']) {
    delete process.env[k];
  }
  process.env.ADMIN_PHONE = ADMIN;
});

afterEach(() => {
  process.env = { ...ORIG };
});

function configureLive() {
  process.env.MSG91_AUTH_KEY = 'authkey-123';
  process.env.MSG91_TEMPLATE_ID_OTP = 'tpl_otp';
  process.env.WHATSAPP_SEND_MODE = 'all';
}

describe('generateOtp', () => {
  it('returns a 6-digit numeric string', () => {
    for (let i = 0; i < 50; i++) {
      const otp = sms.generateOtp();
      expect(otp).toMatch(/^\d{6}$/);
    }
  });
});

describe('sendOtp — guards', () => {
  it('mode=off suppresses without a call', async () => {
    process.env.WHATSAPP_SEND_MODE = 'off';
    const r = await sms.sendOtp(ADMIN, '123456');
    expect(r.result).toBe('suppressed');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('mode=allowlist blocks a non-admin number', async () => {
    process.env.WHATSAPP_SEND_MODE = 'allowlist';
    process.env.MSG91_AUTH_KEY = 'k';
    const r = await sms.sendOtp('911234567890', '123456');
    expect(r.result).toBe('blocked');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('DRY-RUN when MSG91_AUTH_KEY is missing', async () => {
    process.env.WHATSAPP_SEND_MODE = 'all';
    const r = await sms.sendOtp('911234567890', '123456');
    expect(r.result).toBe('dry-run');
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('sendOtp — live (mocked axios)', () => {
  it('posts to the MSG91 OTP endpoint with template + mobile + otp', async () => {
    configureLive();
    axios.post.mockResolvedValueOnce({ status: 200, data: { type: 'success' } });
    const r = await sms.sendOtp('9958533994', '654321');
    expect(r.type).toBe('success');
    const [url, , opts] = axios.post.mock.calls[0];
    expect(url).toContain('/api/v5/otp');
    expect(opts.params).toMatchObject({ template_id: 'tpl_otp', mobile: '919958533994', otp: '654321' });
    expect(opts.headers.authkey).toBe('authkey-123');
  });
});

describe('sendSms', () => {
  it('off → suppressed, no call', async () => {
    process.env.WHATSAPP_SEND_MODE = 'off';
    const r = await sms.sendSms(ADMIN, 'hello');
    expect(r.result).toBe('suppressed');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('live → posts to the MSG91 flow endpoint', async () => {
    configureLive();
    axios.post.mockResolvedValueOnce({ status: 200, data: { type: 'success' } });
    await sms.sendSms('9958533994', 'your protocol resumes', 'tpl_flow');
    const [url, body] = axios.post.mock.calls[0];
    expect(url).toContain('/api/v5/flow');
    expect(body.template_id).toBe('tpl_flow');
    expect(body.recipients[0].mobiles).toBe('919958533994');
  });
});

describe('isConfigured', () => {
  it('false without an auth key, true with one', () => {
    expect(sms.isConfigured()).toBe(false);
    process.env.MSG91_AUTH_KEY = 'k';
    expect(sms.isConfigured()).toBe(true);
  });
});
