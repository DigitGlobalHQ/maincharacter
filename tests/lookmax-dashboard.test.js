import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-dash-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.UPLOAD_DIR = path.join(tmpDir, 'uploads');
process.env.ADMIN_PASSWORD = 'dashpass';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES = '918595833852';
process.env.JWT_SECRET = 'dash-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
delete process.env.GEMINI_API_KEY;

const request = require('supertest');
const express = require('express');
const lookmaxRoutes = require('../routes/lookmax');
const authRoutes = require('../routes/lookmax-auth');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRoutes);
app.use('/api/lookmax', lookmaxRoutes);

async function token() {
  const r = await request(app).post('/api/lookmax/auth/admin-login').send({ phone: '8595833852', password: 'dashpass' });
  return r.body.token;
}

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('GET /api/lookmax/dashboard', () => {
  it('401s without a token', async () => {
    const res = await request(app).get('/api/lookmax/dashboard');
    expect(res.status).toBe(401);
  });

  it('returns the full shape with no activity yet', async () => {
    const t = await token();
    const res = await request(app).get('/api/lookmax/dashboard').set('Authorization', `Bearer ${t}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toHaveProperty('auraPlusPlus');
    expect(res.body.today.mirror.takenToday).toBe(false);
    expect(res.body.today.protocol).toEqual({ completedCount: 0, totalCount: 0, isLocked: false });
    expect(res.body.today.hair.unlocked).toBe(true); // no readings yet → unlocked
    expect(Array.isArray(res.body.thisWeek)).toBe(true);
    expect(res.body.thisWeek.length).toBe(7);
    expect(res.body.thisWeek.every((d) => d === false)).toBe(true);
    expect(res.body.mirrorLevel).toBe('raw');
  });

  it('reflects today\'s mirror once taken (tile + week strip)', async () => {
    const t = await token();
    await request(app).post('/api/lookmax/mirror').set('Authorization', `Bearer ${t}`).attach('photo', Buffer.from([0xff, 0xd8]), 'm.jpg');
    const res = await request(app).get('/api/lookmax/dashboard').set('Authorization', `Bearer ${t}`);
    expect(res.body.today.mirror.takenToday).toBe(true);
    expect(typeof res.body.today.mirror.score).toBe('number');
    expect(res.body.today.mirror.at).toMatch(/^\d{2}:\d{2}$/);
    expect(res.body.thisWeek[6]).toBe(true); // today is the last dot
    expect(res.body.streak).toBe(1);
  });

  it('reflects protocol progress', async () => {
    const t = await token();
    const today = await request(app).get('/api/lookmax/protocol/today').set('Authorization', `Bearer ${t}`);
    await request(app).post('/api/lookmax/protocol/check').set('Authorization', `Bearer ${t}`).send({ itemId: today.body.items[0].itemId, checked: true });
    const res = await request(app).get('/api/lookmax/dashboard').set('Authorization', `Bearer ${t}`);
    expect(res.body.today.protocol.totalCount).toBeGreaterThanOrEqual(5);
    expect(res.body.today.protocol.completedCount).toBe(1);
  });
});
