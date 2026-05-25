import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// wati reads WATI_SEND_MODE / ADMIN_PHONE / WATI_ALLOWLIST dynamically, so we
// can flip them per-test. WATI_API_KEY is read at import time and left empty,
// so any "allowed" send falls through to dry-run (no network).
const wati = require('../services/wati');

const ORIG = { ...process.env };

beforeEach(() => {
  delete process.env.WATI_SEND_MODE;
  delete process.env.WATI_ALLOWLIST;
  process.env.ADMIN_PHONE = '919958533994';
});

afterEach(() => {
  process.env = { ...ORIG };
});

describe('normalizePhone', () => {
  it('prefixes 91 for 10-digit numbers', () => {
    expect(wati.normalizePhone('8595833852')).toBe('918595833852');
  });
  it('strips +, spaces and dashes', () => {
    expect(wati.normalizePhone('+91 859-583-3852')).toBe('918595833852');
  });
  it('leaves already-prefixed numbers intact', () => {
    expect(wati.normalizePhone('918595833852')).toBe('918595833852');
  });
});

describe('getSendMode', () => {
  it('defaults to allowlist (safe)', () => {
    expect(wati.getSendMode()).toBe('allowlist');
  });
  it('honours valid modes', () => {
    process.env.WATI_SEND_MODE = 'all';
    expect(wati.getSendMode()).toBe('all');
    process.env.WATI_SEND_MODE = 'off';
    expect(wati.getSendMode()).toBe('off');
  });
  it('falls back to allowlist for an unknown mode', () => {
    process.env.WATI_SEND_MODE = 'banana';
    expect(wati.getSendMode()).toBe('allowlist');
  });
});

describe('isAllowed', () => {
  it('off blocks everyone, including admin', () => {
    process.env.WATI_SEND_MODE = 'off';
    expect(wati.isAllowed('919958533994')).toBe(false);
  });
  it('all permits everyone', () => {
    process.env.WATI_SEND_MODE = 'all';
    expect(wati.isAllowed('911234567890')).toBe(true);
  });
  it('allowlist permits admin only by default', () => {
    process.env.WATI_SEND_MODE = 'allowlist';
    expect(wati.isAllowed('919958533994')).toBe(true);
    expect(wati.isAllowed('911234567890')).toBe(false);
  });
  it('allowlist includes WATI_ALLOWLIST extras (normalised)', () => {
    process.env.WATI_SEND_MODE = 'allowlist';
    process.env.WATI_ALLOWLIST = '8595833852, 919000000000';
    expect(wati.isAllowed('918595833852')).toBe(true);
    expect(wati.isAllowed('919000000000')).toBe(true);
  });
});

describe('sendMessage guard (no network)', () => {
  it('mode=off suppresses without sending', async () => {
    process.env.WATI_SEND_MODE = 'off';
    const r = await wati.sendMessage('919958533994', 'hello');
    expect(r.result).toBe('suppressed');
  });
  it('mode=allowlist blocks a non-listed number', async () => {
    process.env.WATI_SEND_MODE = 'allowlist';
    const r = await wati.sendMessage('911234567890', 'hello');
    expect(r.result).toBe('blocked');
  });
  it('mode=allowlist + admin + no creds falls through to dry-run', async () => {
    process.env.WATI_SEND_MODE = 'allowlist';
    const r = await wati.sendMessage('919958533994', 'hello');
    expect(r.result).toBe('dry-run');
  });
});
