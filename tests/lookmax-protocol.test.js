import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-protocol-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.ADMIN_PASSWORD = 'protopass';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES = '918595833852,919000000050';
process.env.JWT_SECRET = 'proto-secret';
process.env.WHATSAPP_SEND_MODE = 'off';

const request = require('supertest');
const express = require('express');
const protocol = require('../services/protocol');
const lookmaxRoutes = require('../routes/lookmax');
const authRoutes = require('../routes/lookmax-auth');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRoutes);
app.use('/api/lookmax', lookmaxRoutes);

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

const fakeUser = { token: 't1', auditSessionId: null };

describe('protocol generator', () => {
  it('returns 5-7 do items and 1-3 do-nots', () => {
    const day = protocol.generateProtocol(fakeUser, { scores: {}, weakestAxis: 'hairDensity' });
    expect(day.items.length).toBeGreaterThanOrEqual(5);
    expect(day.items.length).toBeLessThanOrEqual(7);
    expect(day.doNots.length).toBeGreaterThanOrEqual(1);
    expect(day.doNots.length).toBeLessThanOrEqual(3);
  });

  it('weakestAxis drives item selection (hairDensity → hair items)', () => {
    const day = protocol.generateProtocol(fakeUser, { scores: {}, weakestAxis: 'hairDensity' });
    expect(day.generatedFrom).toBe('hairDensity');
    expect(day.items.some((i) => i.itemId.startsWith('hair-'))).toBe(true);
    expect(day.doNots.some((d) => d.itemId.startsWith('hair-'))).toBe(true);
  });

  it('skinClarity weakest → skin items + skin do-nots', () => {
    const day = protocol.generateProtocol(fakeUser, { scores: {}, weakestAxis: 'skinClarity' });
    expect(day.items.some((i) => i.itemId.startsWith('skin-'))).toBe(true);
    expect(day.doNots.some((d) => d.itemId.startsWith('skin-'))).toBe(true);
  });

  it('posture weakest → movement items', () => {
    const day = protocol.generateProtocol(fakeUser, { scores: {}, weakestAxis: 'posture' });
    expect(day.items.some((i) => i.itemId.startsWith('posture-'))).toBe(true);
  });

  it('always carries the jaw do-not when jaw is affected', () => {
    const day = protocol.generateProtocol(fakeUser, { scores: {}, weakestAxis: 'jawDefinition' });
    expect(day.doNots.some((d) => d.itemId === 'jaw-dn-1')).toBe(true); // DO NOT use jaw exercisers
  });
});

describe('protocol HTTP flow + streak', () => {
  async function tokenFor(phone) {
    const r = await request(app).post('/api/lookmax/auth/admin-login').send({ phone, password: 'protopass' });
    return r.body.token;
  }

  it('GET /protocol/today generates and returns the checklist', async () => {
    const token = await tokenFor('8595833852');
    const res = await request(app).get('/api/lookmax/protocol/today').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalCount).toBeGreaterThanOrEqual(5);
    expect(Array.isArray(res.body.doNots)).toBe(true);
    expect(res.body.isLocked).toBe(false);
  });

  it('completing ≥80% of items increments the streak', async () => {
    const token = await tokenFor('8595833852');
    const today = await request(app).get('/api/lookmax/protocol/today').set('Authorization', `Bearer ${token}`);
    for (const it of today.body.items) {
      await request(app).post('/api/lookmax/protocol/check').set('Authorization', `Bearer ${token}`).send({ itemId: it.itemId, checked: true });
    }
    const done = await request(app).post('/api/lookmax/protocol/complete-day').set('Authorization', `Bearer ${token}`);
    expect(done.body.streakIncremented).toBe(true);
    expect(done.body.streak).toBe(1);
  });

  it('completing the day under 80% breaks the streak (resets to 0)', async () => {
    const token = await tokenFor('919000000050');
    await request(app).get('/api/lookmax/protocol/today').set('Authorization', `Bearer ${token}`); // generate
    const done = await request(app).post('/api/lookmax/protocol/complete-day').set('Authorization', `Bearer ${token}`);
    expect(done.body.streakIncremented).toBe(false);
    expect(done.body.streak).toBe(0);
  });

  it('cannot toggle a locked day', async () => {
    const token = await tokenFor('8595833852');
    const today = await request(app).get('/api/lookmax/protocol/today').set('Authorization', `Bearer ${token}`);
    expect(today.body.isLocked).toBe(true);
    const res = await request(app).post('/api/lookmax/protocol/check').set('Authorization', `Bearer ${token}`).send({ itemId: today.body.items[0].itemId, checked: false });
    expect(res.status).toBe(409);
  });
});
