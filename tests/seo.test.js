import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// robots.txt + sitemap.xml are static files in /public (served by express.static).
const BASE = 'https://maincharacter.digitglobalservices.com';

const PAGES = {
  home:    { file: 'landing.html',                  canonical: `${BASE}/` },
  reading: { file: 'public/lookmaxing/index.html',  canonical: `${BASE}/lookmaxing/` },
  start:   { file: 'public/lookmaxing/start.html',  canonical: `${BASE}/lookmaxing/start` },
  privacy: { file: 'public/privacy.html',           canonical: `${BASE}/privacy` },
  terms:   { file: 'public/terms.html',             canonical: `${BASE}/terms` },
};

describe('SEO — public/robots.txt (static)', () => {
  const txt = read('public/robots.txt');
  it('allows crawling and points at the sitemap', () => {
    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
    expect(txt).toContain(`Sitemap: ${BASE}/sitemap.xml`);
  });
  it('disallows the noindex sign-in page (one-x path)', () => {
    expect(txt).toContain('Disallow: /lookmaxing/start');
  });
  it('keeps the existing private-surface disallows (no regression)', () => {
    expect(txt).toContain('Disallow: /admin');
    expect(txt).toContain('Disallow: /api/');
  });
  it('never uses the two-x /lookmaxxing typo', () => {
    expect(txt).not.toMatch(/lookmaxxing/);
  });
});

describe('SEO — public/sitemap.xml (static)', () => {
  const xml = read('public/sitemap.xml');
  it('is well-formed and lists the core indexable URLs', () => {
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(`<loc>${BASE}/</loc>`);
    expect(xml).toContain(`<loc>${BASE}/lookmaxing/</loc>`);
    expect(xml).toContain(`<loc>${BASE}/privacy</loc>`);
    expect(xml).toContain(`<loc>${BASE}/terms</loc>`);
  });
  it('excludes the noindex sign-in page and the two-x typo', () => {
    expect(xml).not.toContain('/lookmaxing/start');
    expect(xml).not.toMatch(/lookmaxxing/);
  });
});

describe('SEO — per-page self-referencing canonicals (one-x URL)', () => {
  for (const [name, p] of Object.entries(PAGES)) {
    it(`${name} has the correct canonical`, () => {
      const html = read(p.file);
      expect(html).toContain(`<link rel="canonical" href="${p.canonical}">`);
    });
    it(`${name} never emits a two-x /lookmaxxing URL`, () => {
      const html = read(p.file);
      expect(html).not.toContain('digitglobalservices.com/lookmaxxing');
    });
  }
});

describe('SEO — noindex is on the sign-in page ONLY', () => {
  it('start.html is noindex', () => {
    expect(read(PAGES.start.file)).toContain('<meta name="robots" content="noindex, follow">');
  });
  for (const name of ['home', 'reading', 'privacy', 'terms']) {
    it(`${name} is NOT noindex`, () => {
      expect(read(PAGES[name].file)).not.toMatch(/name="robots"[^>]*noindex/);
    });
  }
});

describe('SEO — Open Graph / Twitter on indexable pages', () => {
  for (const name of ['home', 'reading', 'privacy', 'terms']) {
    const html = read(PAGES[name].file);
    it(`${name} has og:title, og:url, og:image and twitter:card`, () => {
      expect(html).toMatch(/<meta property="og:title"/);
      expect(html).toContain(`<meta property="og:url" content="${PAGES[name].canonical}">`);
      expect(html).toContain('og-image.png');
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    });
  }
});

describe('SEO — og-image asset exists at 1200x630 path', () => {
  it('public/og-image.png is present', () => {
    expect(() => readFileSync(join(root, 'public', 'og-image.png'))).not.toThrow();
  });
});

describe('SEO — title/description claim accuracy (verified vs live product)', () => {
  const home = read(PAGES.home.file);
  it('homepage title carries the keywords', () => {
    expect(home).toContain('Free Aura Reading');
    expect(home).toContain('Looksmaxxing');
  });
  it('homepage meta description says "daily" protocol, never the Orator "7-day"', () => {
    const desc = home.match(/<meta name="description" content="([^"]+)"/)[1];
    expect(desc).toContain('daily glow up protocol');
    expect(desc).not.toMatch(/7-day/);
  });
});

describe('SEO — §2 H1s (homepage locked, reading on-voice + keyword)', () => {
  it('homepage H1 stays the locked brand line', () => {
    expect(read(PAGES.home.file)).toContain('<h1 class="hero__headline">Become the Main Character</h1>');
  });
  it('reading H1 keeps the iconic line and adds "aura reading" in-voice', () => {
    const html = read(PAGES.reading.file);
    expect(html).toContain('Before you open your mouth, you have already been read. This is your aura reading.');
  });
});

describe('SEO — brand mark alt text', () => {
  it('homepage hero mark has descriptive alt', () => {
    expect(read(PAGES.home.file)).toContain('class="hero__mark-img" src="/maincharacter-mark-3d.png" alt="MainCharacter logo"');
  });
  it('reading nav logo has descriptive alt', () => {
    expect(read(PAGES.reading.file)).toContain('class="lm-nav__logo" src="/maincharacter-mark-3d.png" alt="MainCharacter logo"');
  });
});
