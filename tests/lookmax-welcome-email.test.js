/**
 * PR C — welcome email. Fires exactly once, on a real user's FIRST sign-in
 * (self-serve providers only). Wired through recordLogin (PR B). Test-first (§6).
 *
 * recordLogin lazy-requires services/email, so we spy by replacing the cached
 * module's sendWelcome — the route holds the same module instance.
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-welcome-'));
process.env.USERS_FILE_PATH = path.join(tmpDir, 'users.json');
process.env.WAITLIST_FILE_PATH = path.join(tmpDir, 'waitlist.json');
process.env.LOOKMAX_FILE_PATH = path.join(tmpDir, 'lookmax.json');
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.WHATSAPP_SEND_MODE = 'off';

const User = require('../models/User');
const email = require('../services/email');
const { recordLogin } = require('../lib/lookmax-auth');

let spy;
beforeEach(() => { spy = vi.spyOn(email, 'sendWelcome').mockResolvedValue({ result: 'spy' }); });
afterEach(() => { vi.restoreAllMocks(); }); // unwind spies so they never stack across tests
afterAll(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('welcome email on first sign-in', () => {
  it('fires once for a self-serve (email) account on its first login', async () => {
    const u = await User.getOrCreateByEmail({ email: 'welcome1@example.test', name: 'Welcome One', provider: 'email' });
    await recordLogin(u, 'email');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].user.email).toBe('welcome1@example.test');
  });

  it('does NOT fire again on subsequent logins', async () => {
    const u = await User.getOrCreateByEmail({ email: 'welcome2@example.test', name: 'Welcome Two', provider: 'email' });
    const after = await recordLogin(u, 'email');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockClear();
    await recordLogin(after, 'email');
    expect(spy).not.toHaveBeenCalled();
  });

  it('fires for a Google first sign-in', async () => {
    const u = await User.getOrCreateByEmail({ email: 'welcome3@example.test', name: 'Welcome Three', provider: 'google' });
    await recordLogin(u, 'google');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire for admin / comp accounts', async () => {
    const u = await User.getOrCreateByEmail({ email: 'founder@example.test', name: 'Founder', provider: 'email' });
    await recordLogin(u, 'admin');
    expect(spy).not.toHaveBeenCalled();
  });

  it('does NOT fire when the user has no email', async () => {
    const u = await User.createUser({ name: 'PhoneOnly', phone: '919900000001', pillar: 'aesthetic' });
    await recordLogin(u, 'phone-otp');
    expect(spy).not.toHaveBeenCalled();
  });

  it('a failing welcome send never breaks the login', async () => {
    spy.mockRejectedValueOnce(new Error('resend down'));
    const u = await User.getOrCreateByEmail({ email: 'resilient@example.test', name: 'Resilient', provider: 'email' });
    const after = await recordLogin(u, 'email');
    expect(after.loginCount).toBe(1); // login still recorded
  });
});

describe('email.sendWelcome()', () => {
  beforeEach(() => { spy.mockRestore(); }); // exercise the real implementation

  it('renders the welcome template with the user name and is DRY-RUN safe', async () => {
    const prevMode = process.env.WHATSAPP_SEND_MODE;
    process.env.WHATSAPP_SEND_MODE = 'all'; // reach the dry-run branch (not suppressed)
    delete process.env.RESEND_API_KEY;
    const res = await email.sendWelcome({ user: { name: 'Aria', email: 'aria@example.test' } });
    expect(res.result).toBe('dry-run');
    process.env.WHATSAPP_SEND_MODE = prevMode;
  });

  it('returns no-recipient when the user has no email', async () => {
    const res = await email.sendWelcome({ user: { name: 'NoMail' } });
    expect(res.result).toBe('no-recipient');
  });
});
