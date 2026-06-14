import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const BASE = 'https://maincharacter.digitglobalservices.com';
const URL = `${BASE}/blog/how-to-start-looksmaxxing`;
const html = readFileSync(join(root, 'public/blog/how-to-start-looksmaxxing.html'), 'utf8');

// Body word count (strip the <main> content of tags/entities).
const bodyText = html
  .replace(/[\s\S]*<main/, '<main')
  .replace(/<\/main>[\s\S]*/, '</main>')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&[a-z]+;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const wordCount = bodyText.split(' ').filter(Boolean).length;

let ld;
beforeAll(() => {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  ld = JSON.parse(m[1]);
});

describe('blog/how-to-start-looksmaxxing — content', () => {
  it('is 1,200–1,800 words', () => {
    expect(wordCount).toBeGreaterThanOrEqual(1200);
    expect(wordCount).toBeLessThanOrEqual(1800);
  });

  it('uses exactly one H1 and it contains the target keyword', () => {
    const h1s = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) || [];
    expect(h1s).toHaveLength(1);
    expect(h1s[0].toLowerCase()).toContain('how to start looksmaxxing');
  });

  it('puts the target keyword in the title tag, meta description and canonical slug', () => {
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    const desc = html.match(/<meta name="description" content="([^"]+)"/)[1];
    expect(title.toLowerCase()).toContain('how to start looksmaxxing');
    expect(desc.toLowerCase()).toContain('how to start looksmaxxing');
    expect(html).toContain(`<link rel="canonical" href="${URL}">`);
  });

  it('uses the keyword naturally in the body (present, not stuffed)', () => {
    const exact = (bodyText.toLowerCase().match(/how to start looksmaxxing/g) || []).length;
    const mentions = (bodyText.toLowerCase().match(/looksmaxxing/g) || []).length;
    expect(exact).toBeGreaterThanOrEqual(2);
    expect(mentions).toBeGreaterThanOrEqual(5);
    expect(mentions).toBeLessThanOrEqual(20); // guard against keyword stuffing
  });

  it('covers the required beginner topics', () => {
    const t = bodyText.toLowerCase();
    for (const topic of ['softmaxxing', 'hardmaxxing', 'skincare', 'grooming', 'fitness', 'posture', 'style', 'timeline']) {
      expect(t, `missing topic: ${topic}`).toContain(topic);
    }
  });

  it('is accurate about mewing (flags it as unproven, no overpromise)', () => {
    const t = bodyText.toLowerCase();
    expect(t).toContain('mewing');
    expect(t).toMatch(/no strong scientific evidence|not supported/);
  });

  it('has no hype punctuation (Consultant voice) — no exclamation marks', () => {
    expect(bodyText).not.toContain('!');
  });
});

describe('blog/how-to-start-looksmaxxing — internal links', () => {
  it('links to the homepage with descriptive anchor text', () => {
    expect(html).toMatch(/<a href="\/">become the main character<\/a>/i);
  });
  it('links to the aura reading page (200 URL) with descriptive anchor text', () => {
    expect(html).toMatch(/<a href="\/lookmaxing\/">get your free aura reading<\/a>/i);
  });
});

describe('blog/how-to-start-looksmaxxing — structured data + social', () => {
  it('is a valid BlogPosting with the required fields', () => {
    expect(ld['@type']).toBe('BlogPosting');
    expect(ld.headline.toLowerCase()).toContain('how to start looksmaxxing');
    expect(ld.mainEntityOfPage['@id']).toBe(URL);
  });
  it('includes datePublished AND dateModified', () => {
    expect(ld.datePublished).toBe('2026-06-14');
    expect(ld.dateModified).toBe('2026-06-14');
  });
  it('includes an image field', () => {
    expect(ld.image).toMatch(/og-image\.png$/);
  });
  it('names author and publisher', () => {
    expect(ld.author.name).toBe('The Consultant');
    expect(ld.publisher.name).toBe('MainCharacter');
  });
  it('has self-canonical og:url, og:type article, og:image and twitter:card', () => {
    expect(html).toContain(`<meta property="og:url" content="${URL}">`);
    expect(html).toContain('<meta property="og:type" content="article">');
    expect(html).toContain('og-image.png');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });
  it('is indexable (no stray noindex)', () => {
    expect(html).not.toMatch(/name="robots"[^>]*noindex/);
  });
});

describe('blog/how-to-start-looksmaxxing — sitemap + routing', () => {
  it('is listed in the sitemap with a real lastmod', () => {
    const xml = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
    expect(xml).toContain(`<loc>${URL}</loc>`);
    expect(xml).toMatch(new RegExp(`${URL.replace(/[/.]/g, '\\$&')}</loc><lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>`));
  });
  it('has a /blog/:slug route wired in server.js', () => {
    const server = readFileSync(join(root, 'server.js'), 'utf8');
    expect(server).toMatch(/app\.get\('\/blog\/:slug'/);
  });
  it('is discoverable from the homepage footer (not an orphan)', () => {
    const home = readFileSync(join(root, 'landing.html'), 'utf8');
    expect(home).toMatch(/<a href="\/blog\/how-to-start-looksmaxxing">[^<]+<\/a>/);
  });
});
