import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Isolated store + dry-run messaging before requiring anything.
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-paywall-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.WHATSAPP_SEND_MODE = 'off';

const request = require('supertest');
const express = require('express');
const apiRouter = require('../routes/api');
const User = require('../models/User');

const app = express();
app.use(express.json());
app.use('/api', apiRouter);

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('public/paywall.html structure', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'paywall.html'), 'utf8');

  it('renders all three plan cards at the right prices', () => {
    expect(html).toContain('The Orator');
    expect(html).toContain('₹799');
    expect(html).toContain('Lookmaxxing');
    expect(html).toContain('₹99'); // Lookmaxxing is ₹99/mo — the only Lookmaxxing price
    expect(html).toContain('Aura++');
    expect(html).toContain('₹1,999');
    expect(html).toContain('Saves ₹299/mo');
  });

  it('carries the verbatim brief bullets', () => {
    for (const b of [
      'Daily WhatsApp Protocol',
      'Weekly Evolution Reports',
      'Voice or text both work',
      'Daily Mirror Score',
      'Hair Receding Tracker',
      'Day-30 Re-Audit',
    ]) {
      expect(html).toContain(b);
    }
  });

  it('honours the brand voice (no emojis except ◆, no exclamation marks in copy)', () => {
    // Visible copy only: drop scripts, comments, the doctype, then tags.
    const visible = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<!doctype[^>]*>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/◆/g, '');
    expect(visible).not.toMatch(/!/);
    expect(visible).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('POSTs each card to /api/payment/subscribe with pillars', () => {
    expect(html).toContain("begin(['orator'])");
    expect(html).toContain("begin(['lookmaxxing'])");
    expect(html).toContain("begin(['orator','lookmaxxing'])");
    expect(html).toContain('/api/payment/subscribe');
  });
});

describe('POST /api/payment/subscribe — pillar resolution', () => {
  it('orator pillar → seeker plan (₹799)', async () => {
    const res = await request(app)
      .post('/api/payment/subscribe')
      .send({ pillars: ['orator'], phone: '919000000010', name: 'Ora' });
    expect(res.status).toBe(200);
    expect(res.body.planKey).toBe('seeker');
    expect(res.body.amount).toBe(79900);
    expect(res.body.url).toBeTruthy();
  });

  it('lookmaxxing pillar → lookmax99 plan (₹99 — the only Lookmaxxing price)', async () => {
    const res = await request(app)
      .post('/api/payment/subscribe')
      .send({ pillars: ['lookmaxxing'], phone: '919000000011', name: 'Look' });
    expect(res.body.planKey).toBe('lookmax99');
    expect(res.body.amount).toBe(9900);
  });

  it('both pillars → Aura++ bundle (₹1,999)', async () => {
    const res = await request(app)
      .post('/api/payment/subscribe')
      .send({ pillars: ['orator', 'lookmaxxing'], phone: '919000000012', name: 'Both', email: 'both@x.com' });
    expect(res.body.planKey).toBe('auraplus');
    expect(res.body.amount).toBe(199900);
    const u = User.getUserByPhone('919000000012');
    expect(u.email).toBe('both@x.com');
    expect(u.pendingPillars).toEqual(['orator', 'lookmaxxing']);
  });

  it('rejects an invalid phone', async () => {
    const res = await request(app)
      .post('/api/payment/subscribe')
      .send({ pillars: ['orator'], phone: '123', name: 'Bad' });
    expect(res.status).toBe(400);
  });

  it('is phone-primary: a repeat subscribe updates name/email, no duplicate', async () => {
    await request(app)
      .post('/api/payment/subscribe')
      .send({ pillars: ['orator'], phone: '919000000013', name: 'First' });
    await request(app)
      .post('/api/payment/subscribe')
      .send({ pillars: ['lookmaxxing'], phone: '919000000013', name: 'Second', email: 'second@x.com' });
    const u = User.getUserByPhone('919000000013');
    expect(u.name).toBe('Second');
    expect(u.email).toBe('second@x.com');
  });
});

describe('audit → paywall handoff (audit.html)', () => {
  const auditHtml = fs.readFileSync(path.join(__dirname, '..', 'public', 'audit.html'), 'utf8');
  it('routes to /paywall carrying the audit session token', () => {
    expect(auditHtml).toContain('/paywall?');
    expect(auditHtml).toContain('auditSessionToken');
  });
  it('paywall loads the shared audit-echo helper which fetches the audit result and renders the summary', () => {
    // F2 refactor: the fetch + AXIS_LABELS are consolidated in /shared/audit-echo.js
    // to prevent drift between paywall.html and paywall-waitlist.html.
    const pw = fs.readFileSync(path.join(__dirname, '..', 'public', 'paywall.html'), 'utf8');
    const sharedEcho = fs.readFileSync(path.join(__dirname, '..', 'public', 'shared', 'audit-echo.js'), 'utf8');
    // paywall.html loads the shared helper
    expect(pw).toContain('/shared/audit-echo.js');
    // the shared helper does the fetch and renders the Aura Score line
    expect(sharedEcho).toContain('/api/audit/result/');
    expect(sharedEcho).toContain('Aura Score');
  });
});
