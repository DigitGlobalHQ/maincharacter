import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-reveal-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.UPLOAD_DIR = path.join(tmpDir, 'uploads');
process.env.ADMIN_PASSWORD = 'revealpass';
delete process.env.ADMIN_PASSWORD_HASH;
process.env.ADMIN_PHONES = '918595833852';
process.env.JWT_SECRET = 'reveal-secret';
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
  const r = await request(app).post('/api/lookmax/auth/admin-login').send({ phone: '8595833852', password: 'revealpass' });
  return r.body.token;
}
async function postMirror(t) {
  return request(app).post('/api/lookmax/mirror').set('Authorization', `Bearer ${t}`).attach('photo', Buffer.from([0xff, 0xd8]), 'm.jpg');
}

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('GET /api/lookmax/reveal/preview', () => {
  it('locks the reveal under 4 mirrors this week', async () => {
    const t = await token();
    await postMirror(t);
    await postMirror(t);
    const res = await request(app).get('/api/lookmax/reveal/preview').set('Authorization', `Bearer ${t}`);
    expect(res.body.unlocked).toBe(false);
    expect(res.body.count).toBe(2);
  });

  it('unlocks at 4 of 7 with photo URLs + scores + week number', async () => {
    const t = await token(); // same admin user → accumulates mirrors
    await postMirror(t);
    await postMirror(t); // now 4 total this week
    const res = await request(app).get('/api/lookmax/reveal/preview').set('Authorization', `Bearer ${t}`);
    expect(res.body.unlocked).toBe(true);
    expect(res.body.count).toBeGreaterThanOrEqual(4);
    expect(res.body.weekNumber).toBeGreaterThanOrEqual(1);
    expect(res.body.photoUrls.length).toBe(res.body.count);
    expect(res.body.scores.length).toBe(res.body.count);
    // token-gated URL so an <img> can authenticate
    expect(res.body.photoUrls[0]).toContain('/uploads/');
    expect(res.body.photoUrls[0]).toContain('token=');
  });

  it('401s without a token', async () => {
    const res = await request(app).get('/api/lookmax/reveal/preview');
    expect(res.status).toBe(401);
  });
});

describe('reveal.html share UTM tagging', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'lookmax', 'reveal.html'), 'utf8');
  it('tags shares back to /audit with reveal UTM params', () => {
    expect(html).toContain('utm_source=');
    expect(html).toContain('utm_medium=reveal');
    expect(html).toContain('utm_campaign=week');
  });
  it('offers Instagram, TikTok, WhatsApp and generic share', () => {
    expect(html).toContain("data-share=\"instagram\"");
    expect(html).toContain("data-share=\"tiktok\"");
    expect(html).toContain("data-share=\"whatsapp\"");
    expect(html).toContain('navigator.share');
  });
  it('carries the Consultant-voice stub note about the full video', () => {
    expect(html).toContain('The reveal is a preview');
  });
});
