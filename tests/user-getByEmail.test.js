import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-email-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');

const User = require('../models/User');

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

beforeAll(() => {
  User.createUser({ name: 'Aria', phone: '919100000001', preferredTime: '08:00' });
  User.updateUser('919100000001', { email: 'aria@example.com' });

  User.createUser({ name: 'Bo', phone: '919100000002', preferredTime: '08:00' });
  User.updateUser('919100000002', { email: 'bo@Example.COM' }); // mixed-case

  // Legacy user: no email field at all (simulated by a raw write)
  User.createUser({ name: 'Legacy', phone: '919100000003', preferredTime: '08:00' });
  // Do NOT set email on this user — it stays null per default shape
});

describe('User.getUserByEmail', () => {
  it('finds a user by exact-match email', () => {
    const u = User.getUserByEmail('aria@example.com');
    expect(u).not.toBeNull();
    expect(u.name).toBe('Aria');
  });

  it('is case-insensitive on lookup', () => {
    const u = User.getUserByEmail('ARIA@EXAMPLE.COM');
    expect(u).not.toBeNull();
    expect(u.name).toBe('Aria');
  });

  it('trims whitespace from the input email', () => {
    const u = User.getUserByEmail('  aria@example.com  ');
    expect(u).not.toBeNull();
    expect(u.name).toBe('Aria');
  });

  it('matches even if the stored email has mixed case', () => {
    const u = User.getUserByEmail('bo@example.com');
    expect(u).not.toBeNull();
    expect(u.name).toBe('Bo');
  });

  it('returns null for an email that does not match any user', () => {
    const u = User.getUserByEmail('nobody@nowhere.com');
    expect(u).toBeNull();
  });

  it('returns null when passed null', () => {
    expect(User.getUserByEmail(null)).toBeNull();
  });

  it('returns null when passed undefined', () => {
    expect(User.getUserByEmail(undefined)).toBeNull();
  });

  it('returns null when passed an empty string', () => {
    expect(User.getUserByEmail('')).toBeNull();
  });

  it('tolerates legacy records that have no email field (returns null for them)', () => {
    // The legacy user has email: null (the default).
    // getUserByEmail('') already returns null;
    // also confirm the legacy user itself is not matched by any query
    const u = User.getUserByEmail('legacy@example.com');
    expect(u).toBeNull();
  });

  it('createUser default shape includes all 6 nullable token fields', () => {
    const u = User.createUser({ name: 'NewUser', phone: '919100000099', preferredTime: '08:00' });
    expect(u).toHaveProperty('magicLinkToken', null);
    expect(u).toHaveProperty('magicLinkExpiresAt', null);
    expect(u).toHaveProperty('magicLinkConsumedAt', null);
    expect(u).toHaveProperty('firstLoginToken', null);
    expect(u).toHaveProperty('firstLoginExpiresAt', null);
    expect(u).toHaveProperty('firstLoginConsumedAt', null);
  });
});
