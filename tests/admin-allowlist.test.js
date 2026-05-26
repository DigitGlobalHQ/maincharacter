import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const admin = require('../lib/admin');
const mode = require('../lib/messaging-mode');

const ENV_KEYS = ['ADMIN_PHONES', 'ADMIN_PHONE', 'ADMIN_EMAILS', 'ADMIN_EMAIL', 'WHATSAPP_SEND_MODE'];
let saved;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('lib/admin — multi-admin allowlist', () => {
  it('parses ADMIN_PHONES (comma-separated) and normalises them', () => {
    process.env.ADMIN_PHONES = '918595833852, 9876543210';
    const phones = admin.getAdminPhones();
    expect(phones).toContain('918595833852');
    expect(phones).toContain('919876543210'); // 10-digit gets 91 prefix
  });

  it('falls back to singular ADMIN_PHONE', () => {
    process.env.ADMIN_PHONE = '919958533994';
    expect(admin.getAdminPhones()).toEqual(['919958533994']);
    expect(admin.isAdminPhone('+91 99585 33994')).toBe(true);
  });

  it('unions plural + singular, de-duplicated', () => {
    process.env.ADMIN_PHONES = '918595833852';
    process.env.ADMIN_PHONE = '918595833852';
    expect(admin.getAdminPhones()).toEqual(['918595833852']);
  });

  it('primaryAdminPhone is the first admin phone', () => {
    process.env.ADMIN_PHONES = '918595833852,919876543210';
    expect(admin.primaryAdminPhone()).toBe('918595833852');
  });

  it('emails: plural + singular, case-insensitive', () => {
    process.env.ADMIN_EMAILS = 'Founder@Example.com';
    process.env.ADMIN_EMAIL = 'ops@example.com';
    expect(admin.isAdminEmail('founder@example.com')).toBe(true);
    expect(admin.isAdminEmail('OPS@EXAMPLE.COM')).toBe(true);
    expect(admin.isAdminEmail('stranger@x.com')).toBe(false);
  });

  it('messaging-mode allowlist honours every admin phone', () => {
    process.env.WHATSAPP_SEND_MODE = 'allowlist';
    process.env.ADMIN_PHONES = '918595833852,919876543210';
    expect(mode.isPhoneAllowed('918595833852')).toBe(true);
    expect(mode.isPhoneAllowed('9876543210')).toBe(true);
    expect(mode.isPhoneAllowed('911234567890')).toBe(false);
  });
});
