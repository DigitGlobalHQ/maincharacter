import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const robots = readFileSync(join(__dirname, '..', 'public', 'robots.txt'), 'utf8');

// Minimal Google-style matcher for the `User-agent: *` group.
// Google picks the most specific (longest path) matching rule; on a length tie,
// Allow wins. No wildcards/`$` are used in this file, so prefix match suffices.
function rulesForStar(text) {
  const lines = text.split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter(Boolean);
  const groups = [];
  let cur = null;
  for (const line of lines) {
    const m = line.match(/^(user-agent|allow|disallow|sitemap):\s*(.*)$/i);
    if (!m) continue;
    const field = m[1].toLowerCase();
    const val = m[2].trim();
    if (field === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if ((field === 'allow' || field === 'disallow') && cur) {
      cur.rules.push({ type: field, path: val });
    }
  }
  const g = groups.find((x) => x.agents.includes('*'));
  return g ? g.rules : [];
}

const RULES = rulesForStar(robots);

function isAllowed(path) {
  let best = null;
  for (const r of RULES) {
    if (r.path === '') continue;
    if (path.startsWith(r.path)) {
      if (!best || r.path.length > best.path.length ||
          (r.path.length === best.path.length && r.type === 'allow')) {
        best = r;
      }
    }
  }
  // Default: allowed when no rule matches.
  return best ? best.type === 'allow' : true;
}

describe('robots.txt — Googlebot crawlability', () => {
  it('parsed a User-agent: * group with rules', () => {
    expect(RULES.length).toBeGreaterThan(0);
  });

  it('ALLOWS the homepage /', () => {
    expect(isAllowed('/')).toBe(true);
  });

  it('ALLOWS the reading page /lookmaxing/ (the GSC-flagged URL)', () => {
    expect(isAllowed('/lookmaxing/')).toBe(true);
  });

  it('ALLOWS reading sub-paths in the sitemap (e.g. tools hub)', () => {
    expect(isAllowed('/lookmaxing/tools/')).toBe(true);
  });

  it('DISALLOWS the sign-in page /lookmaxing/start', () => {
    expect(isAllowed('/lookmaxing/start')).toBe(false);
  });

  it('keeps the PWA app /lookmax/ blocked (intentional, real route)', () => {
    expect(isAllowed('/lookmax/')).toBe(false);
    expect(isAllowed('/lookmax/mirror')).toBe(false);
  });

  it('keeps the intended private-surface blocks', () => {
    for (const p of ['/admin', '/dashboard/', '/payment-confirmed', '/uploads/', '/api/']) {
      expect(isAllowed(p), `${p} should be disallowed`).toBe(false);
    }
  });

  it('has an explicit Allow for /lookmaxing/ (unambiguous, not relying on /lookmax/ non-match)', () => {
    expect(robots).toMatch(/^Allow:\s*\/lookmaxing\/\s*$/m);
  });

  it('still points at the sitemap', () => {
    expect(robots).toContain('Sitemap: https://maincharacter.digitglobalservices.com/sitemap.xml');
  });

  it('the /lookmax/ block does not literally match /lookmaxing/ (prefix sanity)', () => {
    expect('/lookmaxing/'.startsWith('/lookmax/')).toBe(false);
  });
});
