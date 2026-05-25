import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-svc-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.WATI_SEND_MODE = 'off';
// No Razorpay keys → mock mode; no Gemini key → fallback scoring.
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;

const razorpay = require('../services/razorpay');
const scheduler = require('../services/scheduler');
const User = require('../models/User');

afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('razorpay service (mock mode)', () => {
  it('exposes both plans with paise amounts', () => {
    expect(razorpay.PLANS.seeker.amount).toBe(79900);
    expect(razorpay.PLANS.sovereign.amount).toBe(149900);
  });

  it('createOrder returns a mock order when no keys', async () => {
    const order = await razorpay.createOrder('seeker', '919000000001', 'Aria');
    expect(order.mock).toBe(true);
    expect(order.amount).toBe(79900);
  });

  it('createOrder throws on an unknown plan', async () => {
    await expect(razorpay.createOrder('nope', '91', 'x')).rejects.toThrow();
  });

  it('createPaymentLink falls back to an upgrade URL when no keys', async () => {
    const url = await razorpay.createPaymentLink('seeker', '919000000001', 'Aria');
    expect(url).toContain('/upgrade?plan=seeker');
  });
});

describe('scheduler.sendMorningMessages (dry-run)', () => {
  function currentIST() {
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
  }

  it('advances a due user to the next day (no real send)', async () => {
    const t = currentIST();
    User.createUser({ name: 'Due', phone: '919800000001', preferredTime: t });
    await scheduler.sendMorningMessages();
    const u = User.getUserByPhone('919800000001');
    expect(u.day).toBe(1);
    expect(u.awaitingResponse).toBe(true);
  });

  it('does nothing when no user matches the current minute', async () => {
    // a user whose time is deliberately not "now"
    User.createUser({ name: 'NotDue', phone: '919800000002', preferredTime: '99:99' });
    await scheduler.sendMorningMessages();
    expect(User.getUserByPhone('919800000002').day).toBe(0);
  });
});
