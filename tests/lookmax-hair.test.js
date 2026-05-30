import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-hair-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.UPLOAD_DIR = path.join(tmpDir, 'uploads');
process.env.ADMIN_PASSWORD = 'hairpass';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES = '918595833852';
process.env.JWT_SECRET = 'hair-secret';
process.env.WHATSAPP_SEND_MODE = 'off';
delete process.env.GEMINI_API_KEY; // force vision fallback (low-confidence)

const request = require('supertest');
const express = require('express');
const hair = require('../services/hair');
const vision = require('../services/vision');
const lookmaxRoutes = require('../routes/lookmax');
const authRoutes = require('../routes/lookmax-auth');

const app = express();
app.use(express.json());
app.use('/api/lookmax', authRoutes);
app.use('/api/lookmax', lookmaxRoutes);

afterAll(() => { vision._setModel(null); fs.rmSync(tmpDir, { recursive: true, force: true }); });

describe('Norwood recommendation routing (SAFE-ONLY — Phase 1)', () => {
  const V = require('../lib/safety-validator');
  const allText = (r) =>
    [...r.do, ...r.doNot].map((d) => `${d.title}\n${d.instruction || ''}`).join('\n');

  it('every stage emits ZERO medical/pharmacological content', () => {
    for (let n = 1; n <= 7; n++) {
      const r = hair.recommendationsForNorwood(n);
      expect(V.isSafe(allText(r)), `Norwood ${n} tripped: ${V.findViolations(allText(r))}`).toBe(true);
      // explicit: none of the previously-shipped drug/procedure names survive
      expect(/minoxidil|finasteride|ketoconazole|microneedling|transplant|fue|biotin/i.test(allText(r))).toBe(false);
    }
  });

  it('mild reading: style + care guidance, no treatments', () => {
    const r = hair.recommendationsForNorwood(1);
    expect(r.do.length).toBeGreaterThan(0);
    expect(r.do.some((d) => /cut|length|scalp|sleep/i.test(d.title))).toBe(true);
  });

  it('moderate reading: cut/scalp/sun guidance', () => {
    const r = hair.recommendationsForNorwood(3);
    expect(r.do.some((d) => /cut|scalp|sun|sleep|stress/i.test(d.title))).toBe(true);
  });

  it('concerned reading: offers a qualified-professional referral, not a prescription', () => {
    const r = hair.recommendationsForNorwood(5);
    expect(r.do.some((d) => /professional/i.test(d.title))).toBe(true);
    expect(V.isSafe(allText(r))).toBe(true);
  });

  it('heavier reading: own-the-look + frame guidance, honest referral', () => {
    const r = hair.recommendationsForNorwood(7);
    expect(r.do.some((d) => /short|beard|frame|professional/i.test(d.title))).toBe(true);
    expect(V.isSafe(allText(r))).toBe(true);
  });

  it('DO NOT list is always present for every stage', () => {
    for (let n = 1; n <= 7; n++) {
      expect(hair.recommendationsForNorwood(n).doNot.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('source copy is natively safe — nothing gets auto-replaced (no false positives)', () => {
    for (let n = 1; n <= 7; n++) {
      const r = hair.recommendationsForNorwood(n);
      expect([...r.do, ...r.doNot].some((d) => d.replacedForSafety)).toBe(false);
    }
  });

  it('clamps out-of-range Norwood input', () => {
    expect(hair.recommendationsForNorwood(99).do.length).toBeGreaterThan(0); // → treated as 7
    expect(hair.recommendationsForNorwood(0).doNot.length).toBeGreaterThan(0); // → treated as 1
  });
});

describe('vision.scoreHair guards', () => {
  it('falls back to low confidence + null recession with no model', async () => {
    vision._setModel(null);
    const r = await vision.scoreHair({ front: { data: 'x', mimeType: 'image/jpeg' }, crown: { data: 'y', mimeType: 'image/jpeg' } });
    expect(r.confidence).toBe('low');
    expect(r.recessionMm).toBeNull();
  });

  it('clamps a malicious/garbage model response (injection guard)', async () => {
    vision._setModel({ generateContent: async () => ({ response: { text: () => '{"norwood": 99, "hairlineScore": 999, "recessionMm": 5, "confidence": "high"}' } }) });
    const r = await vision.scoreHair({ front: { data: 'x', mimeType: 'image/jpeg' }, crown: { data: 'y', mimeType: 'image/jpeg' } });
    expect(r.norwood).toBeLessThanOrEqual(7);
    expect(r.hairlineScore).toBeLessThanOrEqual(100);
    vision._setModel(null);
  });
});

describe('POST /api/lookmax/hair/photo round-trip', () => {
  it('requires both photos', async () => {
    const login = await request(app).post('/api/lookmax/auth/admin-login').send({ phone: '8595833852', password: 'hairpass' });
    const res = await request(app)
      .post('/api/lookmax/hair/photo')
      .set('Authorization', `Bearer ${login.body.token}`)
      .attach('front', Buffer.from([1, 2, 3]), 'f.jpg');
    expect(res.status).toBe(400);
  });

  it('analyses both photos and returns recommendations + insufficient-data recession', async () => {
    const login = await request(app).post('/api/lookmax/auth/admin-login').send({ phone: '8595833852', password: 'hairpass' });
    const res = await request(app)
      .post('/api/lookmax/hair/photo')
      .set('Authorization', `Bearer ${login.body.token}`)
      .attach('front', Buffer.from([0xff, 0xd8, 0xff]), 'f.jpg')
      .attach('crown', Buffer.from([0xff, 0xd8, 0xff]), 'c.jpg');
    expect(res.status).toBe(200);
    expect(res.body.recommendations.doNot.length).toBeGreaterThanOrEqual(1);
    expect(res.body.confidence).toBe('low');
    expect(res.body.recessionMm).toBeNull();
    expect(typeof res.body.consultantLine).toBe('string');
  });

  it('history reflects the reading and applies the weekly cooldown', async () => {
    const login = await request(app).post('/api/lookmax/auth/admin-login').send({ phone: '8595833852', password: 'hairpass' });
    const res = await request(app).get('/api/lookmax/hair/history').set('Authorization', `Bearer ${login.body.token}`);
    expect(res.body.readings.length).toBeGreaterThanOrEqual(1);
    expect(res.body.unlocked).toBe(false); // just took one → cooldown active
    expect(res.body.latest.recommendations).toBeTruthy();
  });
});
