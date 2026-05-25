import { describe, it, expect, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Throwaway store + dry-run sends, set before anything is required (P1.1).
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-startnow-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.WATI_SEND_MODE = 'off';

const apiRouter = require('../routes/api');
const User = require('../models/User');
const { DAYS } = require('../data/orator-content');

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('START NOW seeds the Day-1 lexicon (P1.1 regression)', () => {
  it('forges all 5 Day-1 words for a fresh user who replies START NOW', async () => {
    const phone = '918000000101';
    User.createUser({ name: 'Lex', phone, pillar: 'orator', preferredTime: '08:00' });
    expect(User.getUserByPhone(phone).wordsLearned).toHaveLength(0);

    await apiRouter.processWatiWebhook({ waId: phone, text: 'START NOW' });

    const user = User.getUserByPhone(phone);
    expect(user.day).toBe(1);
    expect(user.wordsLearned).toHaveLength(DAYS[1].words.length); // 5
    expect(user.wordsLearned.every((w) => w.status === 'forged')).toBe(true);
    expect(user.wordsLearned.every((w) => w.day === 1)).toBe(true);
    // The exact Day-1 lexicon was forged, not arbitrary words.
    expect(user.wordsLearned.map((w) => w.word).sort()).toEqual(
      DAYS[1].words.map((w) => w.word).sort()
    );
  });

  it('does not double-forge if START NOW arrives twice', async () => {
    const phone = '918000000102';
    User.createUser({ name: 'Mira', phone, pillar: 'orator', preferredTime: '08:00' });

    await apiRouter.processWatiWebhook({ waId: phone, text: 'START NOW' });
    await apiRouter.processWatiWebhook({ waId: phone, text: 'START NOW' });

    expect(User.getUserByPhone(phone).wordsLearned).toHaveLength(DAYS[1].words.length);
  });
});
