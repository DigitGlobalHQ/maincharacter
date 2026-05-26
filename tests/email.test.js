import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const email = require('../services/email');

// Inject a stub transport (vi.mock does not intercept the lazy require('resend')
// in this setup). The shared send fn lets us assert on the payload.
const sendMock = vi.fn();

const ORIG = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  email.__setTransport(sendMock);
  for (const k of ['WHATSAPP_SEND_MODE', 'WATI_SEND_MODE', 'RESEND_API_KEY', 'ADMIN_EMAIL', 'EMAIL_ALLOWLIST']) {
    delete process.env[k];
  }
});

afterEach(() => {
  email.__resetTransport();
  process.env = { ...ORIG };
});

function configureLive(mode = 'all') {
  process.env.RESEND_API_KEY = 're_test_123';
  process.env.WHATSAPP_SEND_MODE = mode;
}

describe('renderTemplate', () => {
  it('substitutes tokens and HTML-escapes plain values', () => {
    const html = email.renderTemplate('paywall-receipt.html', {
      name: '<b>Mira</b>',
      planLabel: 'The Seeker Plan',
      amount: '₹799',
    });
    expect(html).toContain('&lt;b&gt;Mira&lt;/b&gt;'); // escaped
    expect(html).toContain('The Seeker Plan');
    expect(html).not.toContain('{{name}}'); // token replaced
  });

  it('blanks unsupplied tokens', () => {
    const html = email.renderTemplate('audit-confirmation.html', { name: 'Cy' });
    expect(html).not.toMatch(/\{\{[a-z]/i);
  });
});

describe('sendEmail — guards', () => {
  it('no recipient → no-recipient, no send', async () => {
    const r = await email.sendEmail({ subject: 'x', html: '<p>x</p>' });
    expect(r.result).toBe('no-recipient');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('mode=off → suppressed', async () => {
    process.env.WHATSAPP_SEND_MODE = 'off';
    const r = await email.sendEmail({ to: 'a@x.com', subject: 's', html: '<p>h</p>' });
    expect(r.result).toBe('suppressed');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('mode=allowlist blocks a non-admin email', async () => {
    process.env.WHATSAPP_SEND_MODE = 'allowlist';
    process.env.ADMIN_EMAIL = 'founder@example.com';
    process.env.RESEND_API_KEY = 're_test_123';
    const r = await email.sendEmail({ to: 'stranger@x.com', subject: 's', html: '<p>h</p>' });
    expect(r.result).toBe('blocked');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('DRY-RUN when RESEND_API_KEY missing', async () => {
    process.env.WHATSAPP_SEND_MODE = 'all';
    const r = await email.sendEmail({ to: 'a@x.com', subject: 's', html: '<p>h</p>' });
    expect(r.result).toBe('dry-run');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('live → calls Resend with from/to/subject/html', async () => {
    configureLive('all');
    sendMock.mockResolvedValueOnce({ data: { id: 'em_1' }, error: null });
    const r = await email.sendEmail({ to: 'a@x.com', subject: 'Hello', html: '<p>hi</p>' });
    expect(r.id).toBe('em_1');
    expect(sendMock).toHaveBeenCalledTimes(1);
    const arg = sendMock.mock.calls[0][0];
    expect(arg).toMatchObject({ to: 'a@x.com', subject: 'Hello', html: '<p>hi</p>' });
    expect(arg.from).toContain('@');
  });

  it('throws when Resend returns an error', async () => {
    configureLive('all');
    sendMock.mockResolvedValueOnce({ data: null, error: { message: 'bad domain' } });
    await expect(email.sendEmail({ to: 'a@x.com', subject: 's', html: '<p>h</p>' })).rejects.toThrow(/bad domain/);
  });
});

describe('sendPaywallReceipt', () => {
  it('no email → no-recipient', async () => {
    const r = await email.sendPaywallReceipt({ user: { name: 'Bo' }, plan: 'seeker' });
    expect(r.result).toBe('no-recipient');
  });

  it('renders the plan label + amount and sends when configured', async () => {
    configureLive('all');
    sendMock.mockResolvedValueOnce({ data: { id: 'em_2' }, error: null });
    await email.sendPaywallReceipt({
      user: { name: 'Bo', email: 'bo@x.com', token: 'tok123' },
      plan: 'auraplus',
      subscriptionId: 'sub_9',
    });
    const arg = sendMock.mock.calls[0][0];
    expect(arg.to).toBe('bo@x.com');
    expect(arg.html).toContain('Aura++');
    expect(arg.html).toContain('₹1,999');
    expect(arg.html).toContain('sub_9');
    expect(arg.html).toContain('/dashboard/tok123');
  });
});

describe('sendDay7EvolutionReport', () => {
  it('builds score rows + lexicon pills', async () => {
    configureLive('all');
    sendMock.mockResolvedValueOnce({ data: { id: 'em_3' }, error: null });
    await email.sendDay7EvolutionReport({
      user: {
        name: 'Cy',
        email: 'cy@x.com',
        rank: 'seeker',
        scores: [{ day: 7, fluency: 80, confidenceTone: 70, fillerFrequency: 60, vocabularyRange: 75, structure: 65 }],
        wordsLearned: [
          { word: 'GRAVITAS', status: 'mastered' },
          { word: 'CADENCE', status: 'forged' },
        ],
      },
      assessment: 'You spoke with new weight this week.',
    });
    const arg = sendMock.mock.calls[0][0];
    expect(arg.html).toContain('Fluency');
    expect(arg.html).toContain('80');
    expect(arg.html).toContain('GRAVITAS');
    expect(arg.html).toContain('CADENCE');
    expect(arg.html).toContain('You spoke with new weight');
  });
});

describe('isConfigured', () => {
  it('false without a key, true with one', () => {
    expect(email.isConfigured()).toBe(false);
    process.env.RESEND_API_KEY = 're_x';
    expect(email.isConfigured()).toBe(true);
  });
});
