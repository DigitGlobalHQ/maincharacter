/**
 * Website elevation PR 2 — landing hero monogram + type system.
 * Static source assertions (visual changes verified live by the founder).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '..');
const landing = fs.readFileSync(path.join(root, 'landing.html'), 'utf8');

describe('PR2 — transparent logo assets', () => {
  it('ships a transparent mark + full lockup PNG', () => {
    for (const f of ['public/maincharacter-mark.png', 'public/maincharacter-logo.png']) {
      const p = path.join(root, f);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBeGreaterThan(1024); // real image, not a stub
    }
  });
});

describe('PR2 — landing hero monogram', () => {
  it('places the silver mark as the hero, using the transparent PNG', () => {
    expect(landing).toContain('class="hero__mark"');
    expect(landing).toContain('/maincharacter-mark.png');
  });
  it('retires the cropped .jpeg from the landing page', () => {
    expect(landing).not.toContain('maincharacter-logo.jpeg');
  });
  it('the nav uses the transparent mark, not a cropped jpeg', () => {
    expect(landing).toMatch(/class="nav__logo"[^>]*maincharacter-mark\.png/);
  });
});

describe('PR2 — type system', () => {
  it('loads JetBrains Mono and defines the --font-mono token', () => {
    expect(landing).toContain('JetBrains+Mono');
    expect(landing).toContain("--font-mono: 'JetBrains Mono'");
  });
});

describe('PR2 — motion discipline', () => {
  it('the mark and the one hero CTA breathe, and reduced-motion disables them', () => {
    expect(landing).toContain('@keyframes markBreath');
    expect(landing).toContain('@keyframes ctaBreath');
    expect(landing).toMatch(/prefers-reduced-motion: reduce\)\s*\{[^}]*animation:\s*none/s);
  });
});

describe('PR2 — locked hero copy is preserved', () => {
  it('keeps the untouchable hero strings verbatim', () => {
    expect(landing).toContain('Become the Main Character');
    expect(landing).toContain('Personal Growth · Redesigned');
    expect(landing).toContain('MainCharacter makes the gap visible, measurable, and closable');
  });
});
