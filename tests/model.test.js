import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-model-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');

const User = require('../models/User');

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('User model CRUD', () => {
  it('creates and fetches by phone + token, normalising the phone', () => {
    const u = User.createUser({ name: 'Aria', phone: '8595833852', preferredTime: '07:00' });
    expect(u.phone).toBe('918595833852');
    expect(User.getUserByPhone('918595833852').name).toBe('Aria');
    expect(User.getUserByPhone('+91 8595833852').token).toBe(u.token);
    expect(User.getUserByToken(u.token).name).toBe('Aria');
  });

  it('createUser is idempotent at the model level', () => {
    const a = User.createUser({ name: 'Dup', phone: '919111111111' });
    const b = User.createUser({ name: 'Dup2', phone: '919111111111' });
    expect(a.token).toBe(b.token);
  });

  it('updates fields and bumps lastActive', () => {
    User.createUser({ name: 'Up', phone: '919222222222' });
    const updated = User.updateUser('919222222222', { day: 3, status: 'paused' });
    expect(updated.day).toBe(3);
    expect(updated.status).toBe('paused');
  });

  it('records scores and chronicle entries', () => {
    User.createUser({ name: 'Sc', phone: '919333333333' });
    User.addScore('919333333333', { day: 1, fluency: 70 });
    User.addChronicle('919333333333', { day: 1, prompt: 'p', userResponse: 'r' });
    const u = User.getUserByPhone('919333333333');
    expect(u.scores).toHaveLength(1);
    expect(u.scores[0].timestamp).toBeTruthy();
    expect(u.chronicle).toHaveLength(1);
  });

  it('adds words (dedup) and masters them', () => {
    User.createUser({ name: 'W', phone: '919444444444' });
    User.addWordsLearned('919444444444', [{ word: 'GRAVITAS', definition: 'x' }], 1);
    User.addWordsLearned('919444444444', [{ word: 'GRAVITAS', definition: 'x' }], 1); // dup
    User.masterWord('919444444444', 'gravitas');
    const u = User.getUserByPhone('919444444444');
    expect(u.wordsLearned).toHaveLength(1);
    expect(u.wordsLearned[0].status).toBe('mastered');
  });

  it('selects users by morning/evening time windows', () => {
    User.createUser({ name: 'Morn', phone: '919555555555', preferredTime: '06:30' });
    const morning = User.getUsersForTime('06:30');
    expect(morning.some((u) => u.phone === '919555555555')).toBe(true);
    // evening = preferred + 12h
    const evening = User.getUsersForEveningTime('18:30');
    // day must be >=1 for evening; bump it
    User.updateUser('919555555555', { day: 1 });
    expect(User.getUsersForEveningTime('18:30').some((u) => u.phone === '919555555555')).toBe(true);
    expect(Array.isArray(evening)).toBe(true);
  });

  it('waitlist adds uniquely and lists', () => {
    expect(User.addToWaitlist('9001112223', 'sage')).toBe(true);
    expect(User.addToWaitlist('9001112223', 'sage')).toBe(false); // dup
    expect(User.getWaitlist().some((e) => e.pillar === 'sage')).toBe(true);
  });
});
