import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const hub = readFileSync(join(root, 'public/lookmaxing/tools/index.html'), 'utf8');
const css = readFileSync(join(root, 'public/lookmaxing/tools/tools.css'), 'utf8');

const cards = [...hub.matchAll(/<a class="tool-link" href="([^"]+)">[\s\S]*?<h3>([\s\S]*?)<\/h3>/g)]
  .map((m) => ({ href: m[1], title: m[2].replace(/<[^>]+>/g, '').trim() }));

describe('tools hub — symmetric 3×3 grid', () => {
  it('has exactly 9 tool cards (divisible by 3 → no orphan row)', () => {
    expect(cards).toHaveLength(9);
    expect(cards.length % 3).toBe(0);
  });
  it('tool-grid uses a 3-column rule on desktop', () => {
    expect(css).toMatch(/@media\(min-width:860px\)\{\.tool-grid\{grid-template-columns:repeat\(3,\s*1fr\)\}\}/);
  });
  it('keeps the responsive ladder (1 → 2 → 3 columns)', () => {
    expect(css).toMatch(/\.tool-grid\{display:grid;grid-template-columns:1fr;/);
    expect(css).toMatch(/@media\(min-width:560px\)\{\.tool-grid\{grid-template-columns:1fr 1fr\}\}/);
  });
  it('the hub uses the wider .wrap--hub container', () => {
    expect(hub).toContain('class="wrap wrap--hub"');
    expect(css).toMatch(/\.wrap--hub\{max-width:1040px\}/);
  });
});

describe('tools hub — every tab is a working link', () => {
  it('every card is an anchor with a non-empty href', () => {
    expect(cards.every((c) => c.href && c.href.startsWith('/'))).toBe(true);
  });
  it('links to the 8 analysis tools and the AI Studio', () => {
    const hrefs = cards.map((c) => c.href);
    for (const slug of [
      'attractiveness-score', 'face-shape', 'jawline-score', 'canthal-tilt',
      'eye-shape', 'face-symmetry', 'golden-ratio', 'facial-ratios',
    ]) {
      expect(hrefs, `missing tool: ${slug}`).toContain(`/lookmaxing/tools/${slug}`);
    }
    expect(hrefs).toContain('/studio'); // AI Studio
  });
  it('every tool slug resolves to a file that exists (no dead tab)', () => {
    for (const c of cards) {
      if (c.href === '/studio') continue; // served by /studio route (tools/studio.html)
      const slug = c.href.replace('/lookmaxing/tools/', '');
      const p = join(root, 'public/lookmaxing/tools', `${slug}.html`);
      expect(() => readFileSync(p), `no page for ${c.href}`).not.toThrow();
    }
  });
});
