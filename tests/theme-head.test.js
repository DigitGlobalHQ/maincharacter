/**
 * tests/theme-head.test.js
 * Light-mode head fragment: no-flash boot, the light token block, and the toggle.
 */
import { describe, it, expect } from 'vitest';

const { themeHead, LIGHT_VARS } = require('../lib/theme-head');

describe('themeHead()', () => {
  const h = themeHead();

  it('boots data-theme before paint from localStorage or prefers-color-scheme', () => {
    expect(h).toContain("localStorage.getItem(k)");
    expect(h).toContain("prefers-color-scheme: light");
    expect(h).toContain("setAttribute('data-theme'");
    // defaults to dark on any failure (the locked default identity)
    expect(h).toContain("setAttribute('data-theme','dark')");
  });

  it('defines a light palette scoped to :root[data-theme="light"] only (dark untouched)', () => {
    expect(h).toContain(':root[data-theme="light"]{');
    // never redefines a bare :root{} (would clobber pages' dark tokens)
    expect(h).not.toMatch(/<style[^>]*>\s*:root\{/);
  });

  it('re-points the core colour tokens to the ivory/graphite light values', () => {
    expect(h).toContain('--obsidian:#f3f1ec'); // bg → warm ivory
    expect(h).toContain('--ink:#16161a');      // text → near-black
    expect(h).toContain('--gold:#3a3a40');     // silver accent → graphite
    expect(h).toContain('--mc-black:#f3f1ec');  // shared tokens.css family covered too
    expect(h).toContain('--mc-gold:#3a3a40');
  });

  it('ships a persisting toggle control, hidden in print', () => {
    expect(h).toContain('mc-theme-toggle');
    expect(h).toContain("localStorage.setItem(k,n)");
    expect(h).toContain('@media print{.mc-theme-toggle{display:none}}');
  });

  it('covers both token families without touching spacing/font/radius tokens', () => {
    const names = LIGHT_VARS.map((v) => v.split(':')[0]);
    expect(names).toContain('--ink');
    expect(names).toContain('--mc-ink-white');
    // colour only — no spacing/typography tokens leaked in
    expect(names.some((n) => /--(mc-)?(sp|fs|lh|ls|dur|r)-/.test(n))).toBe(false);
    expect(names).not.toContain('--font-sans');
  });
});
