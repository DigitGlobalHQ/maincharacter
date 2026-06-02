/**
 * PR E — "Your Journey" history + analytics endpoint (GET /api/lookmax/me/history).
 * Test-first (§6). Exercises the readings timeline, the 8-axis before→after, mirror
 * consistency, hair trend, and the empty/low-data shape a brand-new user gets.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-history-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.UPLOAD_DIR = path.join(tmpDir, 'uploads');
process.env.ADMIN_PASSWORD = 'histpass';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES = '918595833852';
process.env.JWT_SECRET = 'hist-secret';
process.env.WHATSAPP_SEND_MODE = 'off';

const request = require('supertest');
const express = require('express');
const User = require('../models/User');
const Lookmax = require('../models/Lookmax');
const lookmaxRoutes = require('../routes/lookmax');
const authRoutes = require('../routes/lookmax-auth');
const { AESTHETIC_AXES } = require('../data/lookmax-prompts');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRoutes);
app.use('/api/lookmax', lookmaxRoutes);

const PHONE = '918595833852';
async function session() {
  const r = await request(app).post('/api/lookmax/auth/admin-login').send({ phone: '8595833852', password: 'histpass' });
  return { token: r.body.token, userToken: r.body.user.token };
}
const get = (t) => request(app).get('/api/lookmax/me/history').set('Authorization', `Bearer ${t}`);
const axisScores = (v) => Object.fromEntries(AESTHETIC_AXES.map((a) => [a, v]));

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('GET /api/lookmax/me/history', () => {
  it('401s without a token', async () => {
    expect((await request(app).get('/api/lookmax/me/history')).status).toBe(401);
  });

  it('returns a complete, sane shape for a brand-new user (no readings/mirrors/hair)', async () => {
    const { token } = await session();
    const res = await get(token);
    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('mirrorLevel');
    expect(Array.isArray(res.body.readings)).toBe(true);
    expect(res.body.axes).toBeNull();
    expect(res.body.hair).toBeNull();
    expect(res.body.mirrors).toMatchObject({ totalCount: 0, longestStreak: 0, loggedDates: [] });
  });

  it('surfaces a baseline reading from lookmaxBaseline when no audit session exists', async () => {
    const { token } = await session();
    await User.updateUser(PHONE, { lookmaxBaseline: { scores: axisScores(60), capturedAt: '2026-04-03T08:00:00.000Z' } });
    const res = await get(token);
    expect(res.body.readings.length).toBe(1);
    const b = res.body.readings[0];
    expect(b.type).toBe('baseline');
    expect(b.auraScore).toBe(60);          // overall of all-60 axes
    expect(b.rank).toBe('ascendant');      // 50-69
    expect(b.date).toBe('2026-04-03');
    expect(res.body.axes).toBeNull();      // no re-audit yet
  });

  it('adds the re-audit as a second reading and an exact 8-axis before→after', async () => {
    const { token } = await session();
    await User.updateUser(PHONE, {
      lookmaxBaseline: { scores: axisScores(60), capturedAt: '2026-04-03T08:00:00.000Z' },
      reAuditResult: { scores: axisScores(72), completedAt: '2026-05-03T08:00:00.000Z' },
    });
    const res = await get(token);
    expect(res.body.readings.map((r) => r.type)).toEqual(['baseline', 'reaudit']); // oldest→newest
    expect(res.body.readings[1].auraScore).toBe(72);
    expect(res.body.readings[1].rank).toBe('luminary'); // 70-84
    expect(res.body.axes.baseline).toMatchObject(axisScores(60));
    expect(res.body.axes.latest).toMatchObject(axisScores(72));
    expect(Object.keys(res.body.axes.latest).sort()).toEqual([...AESTHETIC_AXES].sort());
  });

  it('reports mirror consistency once a mirror is logged', async () => {
    const { token } = await session();
    await request(app).post('/api/lookmax/mirror').set('Authorization', `Bearer ${token}`).attach('photo', Buffer.from([0xff, 0xd8]), 'm.jpg');
    const res = await get(token);
    expect(res.body.mirrors.totalCount).toBeGreaterThanOrEqual(1);
    expect(res.body.mirrors.loggedDates.length).toBeGreaterThanOrEqual(1);
    expect(res.body.mirrors.longestStreak).toBeGreaterThanOrEqual(1);
  });

  it('surfaces a hair trend once a hair reading exists', async () => {
    const { token, userToken } = await session();
    Lookmax.addHair(userToken, { norwood: 'II', hairlineScore: 68 });
    const res = await get(token);
    expect(res.body.hair).not.toBeNull();
    expect(res.body.hair.current.hairlineScore).toBe(68);
    expect(res.body.hair.current.norwoodStage).toBe('II');
    expect(Array.isArray(res.body.hair.history)).toBe(true);
  });
});
