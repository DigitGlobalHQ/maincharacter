import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-mirror-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.UPLOAD_DIR = path.join(tmpDir, 'uploads');
process.env.ADMIN_PASSWORD = 'mirrorpass';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES = '918595833852';
process.env.JWT_SECRET = 'mirror-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
delete process.env.GEMINI_API_KEY; // force vision fallback (no real API calls)

const request = require('supertest');
const express = require('express');
const lookmaxRoutes = require('../routes/lookmax');
const authRoutes = require('../routes/lookmax-auth');
const vision = require('../services/vision');
const { nextStreak, mirrorLevelFor } = lookmaxRoutes;

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRoutes);
app.use('/api/lookmax', lookmaxRoutes);

let token;
beforeAll(async () => {
  const login = await request(app).post('/api/lookmax/auth/admin-login').send({ phone: '8595833852', password: 'mirrorpass' });
  token = login.body.token;
});
afterAll(() => { vision._setModel(null); fs.rmSync(tmpDir, { recursive: true, force: true }); });

describe('mirror level ladder', () => {
  it('maps scores to the right level', () => {
    expect(mirrorLevelFor(20)).toBe('raw');
    expect(mirrorLevelFor(50)).toBe('polished');
    expect(mirrorLevelFor(65)).toBe('magnetic');
    expect(mirrorLevelFor(80)).toBe('radiant');
    expect(mirrorLevelFor(95)).toBe('sovereign');
  });
});

describe('streak math', () => {
  it('starts at 1 with no previous mirror', () => {
    expect(nextStreak(null, 0)).toBe(1);
  });
  it('increments when the previous mirror was within 30h', () => {
    const prev = { createdAt: new Date(Date.now() - 20 * 3600000).toISOString() };
    expect(nextStreak(prev, 4)).toBe(5);
  });
  it('resets to 1 after a gap over 30h', () => {
    const prev = { createdAt: new Date(Date.now() - 31 * 3600000).toISOString() };
    expect(nextStreak(prev, 9)).toBe(1);
  });
});

describe('POST /api/lookmax/mirror (round-trip, fallback scoring)', () => {
  it('scores an uploaded photo and returns the full reveal shape', async () => {
    const res = await request(app)
      .post('/api/lookmax/mirror')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), 'm.jpg');
    expect(res.status).toBe(200);
    expect(typeof res.body.score).toBe('number');
    expect(res.body.axes).toHaveProperty('skinClarity');
    expect(res.body.mirrorLevel).toBeTruthy();
    expect(res.body.streak).toBe(1);
    expect(res.body.trend.length).toBe(1);
    expect(typeof res.body.consultantLine).toBe('string');
    expect(res.body.consultantLine.length).toBeGreaterThan(0);
  });

  it('a second mirror increments the streak', async () => {
    const res = await request(app)
      .post('/api/lookmax/mirror')
      .set('Authorization', `Bearer ${token}`)
      .attach('photo', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'm2.jpg');
    expect(res.body.streak).toBe(2);
  });

  it('401s without a token', async () => {
    const res = await request(app).post('/api/lookmax/mirror').attach('photo', Buffer.from([1, 2]), 'm.jpg');
    expect(res.status).toBe(401);
  });
});

describe('consultantLine prompt-injection / forbidden-token guard', () => {
  it('rejects a model reply containing a forbidden token and falls back', async () => {
    vision._setModel({ generateContent: async () => ({ response: { text: () => 'Great job, amazing work!' } }) });
    const line = await vision.consultantLine({ skinClarity: 60 }, { skinClarity: 3 });
    expect(line.toLowerCase()).not.toContain('great job');
    expect(line).not.toMatch(/!/);
    vision._setModel(null);
  });

  it('passes through a clean Consultant-voice reply', async () => {
    vision._setModel({ generateContent: async () => ({ response: { text: () => 'Skin clarity climbed three points. The work shows. ◆' } }) });
    const line = await vision.consultantLine({ skinClarity: 63 }, { skinClarity: 3 });
    expect(line).toContain('Skin clarity');
    vision._setModel(null);
  });
});
