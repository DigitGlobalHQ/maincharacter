import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const email = require('../services/email');

const sendMock = vi.fn();
const ORIG = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  email.__setTransport(sendMock);
  // Start with all guards off so we can isolate specific behaviour
  for (const k of ['WHATSAPP_SEND_MODE', 'WATI_SEND_MODE', 'RESEND_API_KEY', 'ADMIN_EMAIL', 'EMAIL_ALLOWLIST']) {
    delete process.env[k];
  }
});

afterEach(() => {
  email.__resetTransport();
  process.env = { ...ORIG };
});

function configureLive(mode = 'all') {
  process.env.RESEND_API_KEY = 're_test_999';
  process.env.WHATSAPP_SEND_MODE = mode;
}

// ─── sendMagicLink ───

describe('sendMagicLink', () => {
  const user = { name: 'Aria', email: 'aria@example.com', phone: '919100000001' };
  const token = 'a'.repeat(64); // 32-byte hex = 64 chars

  it('returns no-recipient when user has no email', async () => {
    const r = await email.sendMagicLink({ user: { name: 'X' }, token });
    expect(r.result).toBe('no-recipient');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns no-recipient when user is null', async () => {
    const r = await email.sendMagicLink({ user: null, token });
    expect(r.result).toBe('no-recipient');
  });

  it('DRY-RUN when RESEND_API_KEY is unset (no crash)', async () => {
    process.env.WHATSAPP_SEND_MODE = 'all';
    const r = await email.sendMagicLink({ user, token });
    expect(r.result).toBe('dry-run');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('sends via Resend when configured, with the token in the URL', async () => {
    configureLive('all');
    sendMock.mockResolvedValueOnce({ data: { id: 'em_magic_1' }, error: null });
    await email.sendMagicLink({ user, token });
    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg.to).toBe('aria@example.com');
    expect(arg.html).toContain(encodeURIComponent(token));
  });

  it('uses the default subject label when no label is provided', async () => {
    configureLive('all');
    sendMock.mockResolvedValueOnce({ data: { id: 'em_magic_2' }, error: null });
    await email.sendMagicLink({ user, token });
    const arg = sendMock.mock.calls[0][0];
    expect(arg.subject).toBeTruthy();
    expect(typeof arg.subject).toBe('string');
  });

  it('accepts a custom label', async () => {
    configureLive('all');
    sendMock.mockResolvedValueOnce({ data: { id: 'em_magic_3' }, error: null });
    await email.sendMagicLink({ user, token, label: 'Custom Entry Link' });
    const arg = sendMock.mock.calls[0][0];
    expect(arg.subject).toBe('Custom Entry Link');
  });

  it('respects allowlist mode — blocks non-allowlisted email', async () => {
    process.env.RESEND_API_KEY = 're_test_999';
    process.env.WHATSAPP_SEND_MODE = 'allowlist';
    process.env.ADMIN_EMAIL = 'founder@example.com';
    const r = await email.sendMagicLink({ user, token });
    expect(r.result).toBe('blocked');
    expect(sendMock).not.toHaveBeenCalled();
  });
});

// ─── L-1 security fix: DRY-RUN log must not emit raw email ───

describe('sendMagicLink — DRY-RUN log masks recipient email (L-1)', () => {
  it('logs masked email (j***@example.com), NOT the raw address', async () => {
    // No RESEND_API_KEY → triggers DRY-RUN path in sendEmail
    process.env.WHATSAPP_SEND_MODE = 'all';
    delete process.env.RESEND_API_KEY;

    const captured = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...args) => {
      captured.push(typeof chunk === 'string' ? chunk : chunk.toString());
      return origWrite(chunk, ...args);
    };

    try {
      const u = { name: 'Jay', email: 'jay@example.com' };
      await email.sendMagicLink({ user: u, token: 'a'.repeat(64) });
    } finally {
      process.stdout.write = origWrite;
    }

    const logOutput = captured.join('');
    // Masked form must be present
    expect(logOutput).toContain('j***@example.com');
    // Raw local-part must NOT appear in any DRY-RUN line
    const dryRunLines = logOutput.split('\n').filter((l) => l.includes('DRY-RUN'));
    expect(dryRunLines.length).toBeGreaterThan(0);
    for (const line of dryRunLines) {
      expect(line).not.toContain('jay@example.com');
    }
  });
});

// ─── sendPaywallReceipt with firstLoginToken ───

describe('sendPaywallReceipt — firstLoginToken integration', () => {
  const user = { name: 'Bo', email: 'bo@example.com', token: 'tok-bo' };

  it('includes the magic-link URL in the receipt when firstLoginToken is provided', async () => {
    configureLive('all');
    sendMock.mockResolvedValueOnce({ data: { id: 'em_receipt_1' }, error: null });
    await email.sendPaywallReceipt({
      user,
      plan: 'lookmaxxing',
      subscriptionId: 'sub_lm1',
      firstLoginToken: 'deadbeef1234',
    });
    const arg = sendMock.mock.calls[0][0];
    expect(arg.html).toContain('deadbeef1234');
  });

  it('does not error when firstLoginToken is omitted (backward compat)', async () => {
    configureLive('all');
    sendMock.mockResolvedValueOnce({ data: { id: 'em_receipt_2' }, error: null });
    await expect(
      email.sendPaywallReceipt({ user, plan: 'seeker', subscriptionId: 'sub_9' })
    ).resolves.not.toThrow();
  });
});
