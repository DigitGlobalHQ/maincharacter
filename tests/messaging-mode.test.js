import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const mode = require('../lib/messaging-mode');

const ORIG = { ...process.env };

beforeEach(() => {
  for (const k of [
    'WHATSAPP_SEND_MODE',
    'WATI_SEND_MODE',
    'WHATSAPP_ALLOWLIST',
    'WATI_ALLOWLIST',
    'EMAIL_ALLOWLIST',
    'ADMIN_EMAIL',
  ]) {
    delete process.env[k];
  }
  process.env.ADMIN_PHONE = '919958533994';
});

afterEach(() => {
  process.env = { ...ORIG };
});

describe('normalizePhone', () => {
  it('prefixes 91 for 10-digit numbers', () => {
    expect(mode.normalizePhone('8595833852')).toBe('918595833852');
  });
  it('strips +, spaces and dashes', () => {
    expect(mode.normalizePhone('+91 859-583-3852')).toBe('918595833852');
  });
  it('leaves already-prefixed numbers intact', () => {
    expect(mode.normalizePhone('918595833852')).toBe('918595833852');
  });
});

describe('getSendMode', () => {
  it('defaults to allowlist (safe)', () => {
    expect(mode.getSendMode()).toBe('allowlist');
  });
  it('honours WHATSAPP_SEND_MODE', () => {
    process.env.WHATSAPP_SEND_MODE = 'all';
    expect(mode.getSendMode()).toBe('all');
    process.env.WHATSAPP_SEND_MODE = 'off';
    expect(mode.getSendMode()).toBe('off');
  });
  it('falls back to the legacy WATI_SEND_MODE for the deprecation window', () => {
    process.env.WATI_SEND_MODE = 'all';
    expect(mode.getSendMode()).toBe('all');
  });
  it('WHATSAPP_SEND_MODE wins over the legacy var', () => {
    process.env.WATI_SEND_MODE = 'all';
    process.env.WHATSAPP_SEND_MODE = 'off';
    expect(mode.getSendMode()).toBe('off');
  });
  it('falls back to allowlist for an unknown mode', () => {
    process.env.WHATSAPP_SEND_MODE = 'banana';
    expect(mode.getSendMode()).toBe('allowlist');
  });
});

describe('isPhoneAllowed', () => {
  it('off blocks everyone, including admin', () => {
    process.env.WHATSAPP_SEND_MODE = 'off';
    expect(mode.isPhoneAllowed('919958533994')).toBe(false);
  });
  it('all permits everyone', () => {
    process.env.WHATSAPP_SEND_MODE = 'all';
    expect(mode.isPhoneAllowed('911234567890')).toBe(true);
  });
  it('allowlist permits admin only by default', () => {
    process.env.WHATSAPP_SEND_MODE = 'allowlist';
    expect(mode.isPhoneAllowed('919958533994')).toBe(true);
    expect(mode.isPhoneAllowed('911234567890')).toBe(false);
  });
  it('allowlist includes WHATSAPP_ALLOWLIST extras (normalised)', () => {
    process.env.WHATSAPP_SEND_MODE = 'allowlist';
    process.env.WHATSAPP_ALLOWLIST = '8595833852, 919000000000';
    expect(mode.isPhoneAllowed('918595833852')).toBe(true);
    expect(mode.isPhoneAllowed('919000000000')).toBe(true);
  });
  it('still honours the legacy WATI_ALLOWLIST', () => {
    process.env.WHATSAPP_SEND_MODE = 'allowlist';
    process.env.WATI_ALLOWLIST = '8595833852';
    expect(mode.isPhoneAllowed('918595833852')).toBe(true);
  });
});

describe('isEmailAllowed', () => {
  it('off blocks all email', () => {
    process.env.WHATSAPP_SEND_MODE = 'off';
    process.env.ADMIN_EMAIL = 'founder@example.com';
    expect(mode.isEmailAllowed('founder@example.com')).toBe(false);
  });
  it('all permits any email', () => {
    process.env.WHATSAPP_SEND_MODE = 'all';
    expect(mode.isEmailAllowed('anyone@example.com')).toBe(true);
  });
  it('allowlist permits ADMIN_EMAIL only by default (case-insensitive)', () => {
    process.env.WHATSAPP_SEND_MODE = 'allowlist';
    process.env.ADMIN_EMAIL = 'Founder@Example.com';
    expect(mode.isEmailAllowed('founder@example.com')).toBe(true);
    expect(mode.isEmailAllowed('stranger@example.com')).toBe(false);
  });
  it('allowlist includes EMAIL_ALLOWLIST extras', () => {
    process.env.WHATSAPP_SEND_MODE = 'allowlist';
    process.env.EMAIL_ALLOWLIST = 'a@x.com, b@y.com';
    expect(mode.isEmailAllowed('a@x.com')).toBe(true);
    expect(mode.isEmailAllowed('b@y.com')).toBe(true);
  });
});
