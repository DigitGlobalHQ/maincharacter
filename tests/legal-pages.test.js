import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const terms = read('public/terms.html');
const refunds = read('public/refunds.html');
const BASE = 'https://maincharacter.digitglobalservices.com';

describe('legal pages — no draft/placeholder leakage', () => {
  for (const [name, html] of [['terms', terms], ['refunds', refunds]]) {
    it(`${name}: no [bracketed] placeholders remain`, () => {
      // Catch [date], [registered address], [city], [amount], [X days], ₹[99], etc.
      expect(html).not.toMatch(/\[[^\]]+\]/);
    });
    it(`${name}: no "DRAFT FOR LEGAL REVIEW" banner`, () => {
      expect(html).not.toMatch(/DRAFT FOR LEGAL REVIEW/i);
    });
    it(`${name}: dated today, not a [date] placeholder`, () => {
      expect(html).toContain('Last updated 14 June 2026');
    });
  }
});

describe('legal pages — pricing reconciled to the live model (₹99/mo, free reading)', () => {
  it('refunds states the ₹99/month subscription and a free reading', () => {
    expect(refunds).toContain('₹99/month');
    expect(refunds).toMatch(/aura reading is free/i);
  });
  it('refunds does NOT carry the draft placeholder prices or a paid audit', () => {
    expect(refunds).not.toMatch(/₹\s*599|4,?999/);
    expect(refunds).not.toMatch(/one-time .* assessment/i);
  });
  it('terms says the reading is free and the plan is recurring via Razorpay', () => {
    expect(terms).toMatch(/aura reading is free/i);
    expect(terms).toContain('Razorpay');
    expect(terms).toMatch(/automatically renews/i);
  });
});

describe('legal pages — key clauses present', () => {
  it('terms covers the load-bearing sections', () => {
    for (const s of [
      'not a medical service',
      'Assumption of risk',
      'No guarantee of results',
      'Limitation of liability',
      'Acceptable use',
      'governed by the laws of India',
    ]) {
      expect(terms, `terms missing: ${s}`).toContain(s);
    }
  });
  it('terms liability cap is self-contained (12 months fees, no blank amount)', () => {
    expect(terms).toMatch(/total amount you paid us .* 12 months/i);
  });
  it('refunds covers cancellation, pre-debit notice, refund cases, and Razorpay payout', () => {
    expect(refunds).toMatch(/cancel anytime/i);
    expect(refunds).toMatch(/before each auto-debit/i);
    expect(refunds).toMatch(/duplicate or accidental charge/i);
    expect(refunds).toMatch(/Razorpay back to your original payment method/i);
    expect(refunds).toMatch(/Consumer Protection Act, 2019/);
  });
});

describe('legal pages — cross-links, canonicals, routing, sitemap, footer', () => {
  it('terms links to privacy and refunds', () => {
    expect(terms).toContain('href="/privacy"');
    expect(terms).toContain('href="/refunds"');
  });
  it('refunds links to terms and privacy', () => {
    expect(refunds).toContain('href="/terms"');
    expect(refunds).toContain('href="/privacy"');
  });
  it('refunds has a self-referencing canonical + OG', () => {
    expect(refunds).toContain(`<link rel="canonical" href="${BASE}/refunds">`);
    expect(refunds).toContain(`<meta property="og:url" content="${BASE}/refunds">`);
    expect(refunds).toContain('<meta name="twitter:card" content="summary_large_image">');
  });
  it('refunds is indexable (no stray noindex)', () => {
    expect(refunds).not.toMatch(/name="robots"[^>]*noindex/);
  });
  it('/refunds route is wired in server.js', () => {
    const server = read('server.js');
    expect(server).toMatch(/app\.get\('\/refunds'/);
  });
  it('/refunds is in the sitemap', () => {
    expect(read('public/sitemap.xml')).toContain(`<loc>${BASE}/refunds</loc>`);
  });
  it('homepage footer links to refunds (and still terms/privacy)', () => {
    const home = read('landing.html');
    expect(home).toContain('<a href="/refunds">Refunds</a>');
    expect(home).toContain('<a href="/terms">Terms</a>');
    expect(home).toContain('<a href="/privacy">Privacy</a>');
  });
});
