/**
 * tests/theme-head.test.js
 * Single dark theme: the injected head fragment pins data-theme="dark" and ships
 * NO light palette and NO toggle (light theme removed, founder 2026-06-16).
 */
import { describe, it, expect } from 'vitest';

const { themeHead } = require('../lib/theme-head');

describe('themeHead()', () => {
  const h = themeHead();

  it('pins data-theme to dark before paint', () => {
    expect(h).toContain("setAttribute('data-theme','dark')");
  });

  it('ships NO light palette (no :root[data-theme="light"] block, no ivory tokens)', () => {
    expect(h).not.toContain(':root[data-theme="light"]');
    expect(h).not.toContain('--obsidian:#f3f1ec');
    expect(h).not.toContain('--mc-black:#f3f1ec');
  });

  it('ships NO theme toggle control', () => {
    expect(h).not.toContain('mc-theme-toggle');
    expect(h).not.toContain('localStorage.setItem');
  });

  it('does not read localStorage or prefers-color-scheme (no opt-in light path)', () => {
    expect(h).not.toContain('prefers-color-scheme');
    expect(h).not.toContain('localStorage.getItem');
  });

  it('never redefines a bare :root{} (would clobber pages dark tokens)', () => {
    expect(h).not.toMatch(/<style[^>]*>\s*:root\{/);
  });
});
