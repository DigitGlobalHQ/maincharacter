/**
 * tests/analytics-head.test.js
 * GA4 + Search Console <head> injection is env-driven, sanitised, and a no-op
 * until configured.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ORIG = { ga: process.env.GA_MEASUREMENT_ID, gsc: process.env.GSC_VERIFICATION };

async function head() {
  // Re-require fresh so env changes are read (the module reads env at call time).
  const mod = await import('../lib/analytics-head.js');
  return mod.analyticsHead();
}

beforeEach(() => { delete process.env.GA_MEASUREMENT_ID; delete process.env.GSC_VERIFICATION; });
afterEach(() => {
  if (ORIG.ga) process.env.GA_MEASUREMENT_ID = ORIG.ga; else delete process.env.GA_MEASUREMENT_ID;
  if (ORIG.gsc) process.env.GSC_VERIFICATION = ORIG.gsc; else delete process.env.GSC_VERIFICATION;
});

describe('analyticsHead', () => {
  it('is empty when nothing is configured', async () => {
    expect(await head()).toBe('');
  });

  it('injects the GA4 gtag loader + config when GA_MEASUREMENT_ID is set', async () => {
    process.env.GA_MEASUREMENT_ID = 'G-ABC1234567';
    const h = await head();
    expect(h).toContain('googletagmanager.com/gtag/js?id=G-ABC1234567');
    expect(h).toContain("gtag('config','G-ABC1234567')");
  });

  it('injects the Search Console meta when GSC_VERIFICATION is set', async () => {
    process.env.GSC_VERIFICATION = 'abcDEF123456_token-xyz';
    const h = await head();
    expect(h).toContain('<meta name="google-site-verification" content="abcDEF123456_token-xyz">');
  });

  it('emits both when both are set', async () => {
    process.env.GA_MEASUREMENT_ID = 'G-ABC1234567';
    process.env.GSC_VERIFICATION = 'abcDEF123456token';
    const h = await head();
    expect(h).toContain('google-site-verification');
    expect(h).toContain('gtag');
  });

  it('rejects injection attempts in env values (sanitised)', async () => {
    process.env.GA_MEASUREMENT_ID = '"><script>alert(1)</script>';
    process.env.GSC_VERIFICATION = '"><img src=x onerror=1>';
    const h = await head();
    expect(h).toBe('');
    expect(h).not.toContain('<script>alert');
  });
});
