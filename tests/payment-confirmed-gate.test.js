/**
 * Tests for payment-confirmed.html — Login Gate modifications:
 *  - Auto-poll loop present (poll config overrides)
 *  - exchange-first-login wired
 *  - Mirror CTA button (.install) present with id="enterMirror"
 *  - F1 fallback link to /lookmax/login
 *  - CSS dot-ellipsis animation present
 *  - Polling state copy (confirmed.pollingState)
 *  - Fallback email link copy (confirmed.fallbackEmailLink)
 *  - Existing locked content unchanged (headline, receipt block, support email)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'payment-confirmed.html'),
  'utf8'
);

describe('payment-confirmed.html — polling loop (F1 mitigation)', () => {
  it('references __PC_POLL_INTERVAL_MS override (test seam)', () => {
    expect(html).toContain('__PC_POLL_INTERVAL_MS');
  });

  it('references __PC_POLL_TIMEOUT_MS override (test seam)', () => {
    expect(html).toContain('__PC_POLL_TIMEOUT_MS');
  });

  it('uses setTimeout chain (not setInterval) for the poll loop', () => {
    // Design spec §6.6 calls for setTimeout chain to avoid drift
    expect(html).toContain('setTimeout');
    // setInterval is OK for the countdown timer on login, but the poll loop
    // itself should use setTimeout. Verify it's a recursive setTimeout pattern.
    expect(html).toContain('setTimeout(attempt');
  });

  it('polls /api/payment/status', () => {
    expect(html).toContain('/api/payment/status');
  });

  it('has a POLL_TIMEOUT variable (30s default)', () => {
    expect(html).toContain('POLL_TIMEOUT');
    expect(html).toContain('30000');
  });

  it('has a POLL_INTERVAL variable (3s default)', () => {
    expect(html).toContain('POLL_INTERVAL');
    expect(html).toContain('3000');
  });
});

describe('payment-confirmed.html — polling state UI', () => {
  it('#loading has aria-live="polite" and role="status"', () => {
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
  });

  it('uses the approved polling-state copy: "Confirming with the bank"', () => {
    // confirmed.pollingState — approved copy from spec
    expect(html).toContain('Confirming with the bank');
  });

  it('has the CSS dot-ellipsis animation on #loading::after', () => {
    expect(html).toContain('#loading::after');
    expect(html).toContain('@keyframes dots');
  });

  it('dot animation has a prefers-reduced-motion guard', () => {
    expect(html).toContain('prefers-reduced-motion');
    expect(html).toContain('animation: none');
  });

  it('static dots fallback is "..." under reduced motion', () => {
    expect(html).toContain("content: '...'");
  });
});

describe('payment-confirmed.html — F1 fallback (30s timeout)', () => {
  it('has the #emailLinkFallback element linking to /lookmax/login', () => {
    expect(html).toContain('id="emailLinkFallback"');
    expect(html).toContain('href="/lookmax/login"');
  });

  it('uses the approved fallback CTA copy: "Send me an entry link instead"', () => {
    // confirmed.fallbackEmailLink — approved copy
    expect(html).toContain('Send me an entry link instead');
  });

  it('#emailLinkFallback is inside the #error block', () => {
    // Verify structural order: error block contains the fallback link
    const errorBlockStart = html.indexOf('id="error"');
    const fallbackStart = html.indexOf('id="emailLinkFallback"');
    expect(errorBlockStart).toBeGreaterThan(-1);
    expect(fallbackStart).toBeGreaterThan(errorBlockStart);
  });
});

describe('payment-confirmed.html — exchange-first-login (silent sign-in)', () => {
  it('calls /api/lookmax/auth/exchange-first-login', () => {
    expect(html).toContain('/api/lookmax/auth/exchange-first-login');
  });

  it('uses localStorage.setItem with key "lookmax.token" (matches app.js convention)', () => {
    expect(html).toContain("localStorage.setItem('lookmax.token'");
  });

  it('exchanges when d.firstLoginToken is present in the status response', () => {
    expect(html).toContain('d.firstLoginToken');
    expect(html).toContain('exchangeFirstLogin');
  });

  it('does NOT import app.js (by design — no nav, no SW registration on this page)', () => {
    expect(html).not.toContain('src="/lookmax/app.js"');
    expect(html).not.toContain('src="app.js"');
  });
});

describe('payment-confirmed.html — Mirror CTA step', () => {
  it('has the enterMirror button with class="install" (reuses existing class)', () => {
    expect(html).toContain('id="enterMirror"');
    expect(html).toContain('class="install"');
  });

  it('enterMirror click navigates to /lookmax/', () => {
    expect(html).toContain("location.href = '/lookmax/'");
  });

  it('has a FOUNDER COPY placeholder comment for confirmed.mirrorCta', () => {
    expect(html).toContain('FOUNDER COPY');
  });

  it('has a default mirror button label "Open the mirror"', () => {
    expect(html).toContain('Open the mirror');
  });

  it('mirror button has aria-label="Open the mirror"', () => {
    expect(html).toContain('aria-label="Open the mirror"');
  });
});

describe('payment-confirmed.html — locked content unchanged', () => {
  it('still has The Consultant headline "The Chamber is open"', () => {
    expect(html).toContain('The Chamber is open');
  });

  it('still reads /api/payment/status with razorpay_subscription_id', () => {
    expect(html).toContain('razorpay_subscription_id');
  });

  it('still has the support email in the error block', () => {
    expect(html).toContain('support@maincharacter.digitglobalservices.com');
  });

  it('still has the receipt block with plan / amount / next billing rows', () => {
    expect(html).toContain('id="rPlan"');
    expect(html).toContain('id="rAmount"');
    expect(html).toContain('id="rNext"');
  });

  it('still has the installBtn (PWA install prompt affordance)', () => {
    expect(html).toContain('id="installBtn"');
  });

  it('has no exclamation marks in copy', () => {
    const prose = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ');
    expect(prose).not.toContain('!');
  });
});

describe('payment-confirmed.html — existing test assertions still pass', () => {
  // These replicate the existing payment-confirmed.test.js HTML structure checks
  // to ensure our rewrite did not break what the backend test depends on.
  it('contains "The Chamber is open" (locked headline)', () => {
    expect(html).toContain('The Chamber is open');
  });

  it('contains /api/payment/status reference', () => {
    expect(html).toContain('/api/payment/status');
  });

  it('contains razorpay_subscription_id', () => {
    expect(html).toContain('razorpay_subscription_id');
  });

  it('contains "being verified" text in error block', () => {
    expect(html).toContain('being verified');
  });

  it('contains support email address', () => {
    expect(html).toContain('support@maincharacter.digitglobalservices.com');
  });
});
