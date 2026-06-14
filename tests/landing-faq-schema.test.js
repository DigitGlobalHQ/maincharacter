import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'landing.html'), 'utf8');

// Collapse whitespace so HTML indentation never diverges from JSON spacing.
const norm = (s) => s.replace(/\s+/g, ' ').trim();

// All four JSON-LD blocks in <head>.
function jsonLdBlocks() {
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(JSON.parse(m[1]));
  return out;
}

// Visible #faq: [{ q, a }] in source order.
function visibleFaq() {
  const sectionMatch = html.match(/<section class="section faq"[\s\S]*?<\/section>/);
  expect(sectionMatch, 'visible #faq section must exist').toBeTruthy();
  const section = sectionMatch[0];
  const re = /<summary class="faq__q">([\s\S]*?)<\/summary>\s*<p class="faq__a">([\s\S]*?)<\/p>/g;
  const out = [];
  let m;
  while ((m = re.exec(section)) !== null) out.push({ q: norm(m[1]), a: norm(m[2]) });
  return out;
}

let blocks, faqLd, visible;
beforeAll(() => {
  blocks = jsonLdBlocks();
  faqLd = blocks.find((b) => b['@type'] === 'FAQPage');
  visible = visibleFaq();
});

describe('landing.html — FAQ + JSON-LD structured data', () => {
  it('has all four JSON-LD blocks and every one is valid JSON', () => {
    // jsonLdBlocks() already JSON.parse()s; a malformed block throws above.
    const types = blocks.map((b) => b['@type']);
    expect(types).toEqual(
      expect.arrayContaining(['FAQPage', 'Organization', 'WebSite', 'SoftwareApplication'])
    );
    expect(blocks.length).toBe(4);
  });

  it('FAQPage has 10 questions', () => {
    expect(faqLd.mainEntity).toHaveLength(10);
  });

  it('visible FAQ has 10 items', () => {
    expect(visible).toHaveLength(10);
  });

  it('visible question + answer text is byte-identical to the FAQPage schema (Google rich-result requirement)', () => {
    faqLd.mainEntity.forEach((entity, i) => {
      expect(norm(entity.name), `question #${i + 1} name mismatch`).toBe(visible[i].q);
      expect(
        norm(entity.acceptedAnswer.text),
        `answer #${i + 1} text mismatch (visible vs schema)`
      ).toBe(visible[i].a);
    });
  });

  // ——— Claim-accuracy regression guards (verified against the codebase 2026-06-14) ———

  it('does NOT claim the face rating comes from a single photo alone (it needs 5 questions)', () => {
    const faceQ = faqLd.mainEntity.find((e) => /how is my face rated/.test(e.name));
    expect(faceQ).toBeTruthy();
    expect(faceQ.acceptedAnswer.text).toMatch(/five quick questions/);
  });

  it('does NOT attribute Orator features (7-day protocol / Weekly Evolution Report) to the ₹99 plan', () => {
    const text = JSON.stringify(faqLd) + visible.map((v) => v.a).join(' ');
    expect(text).not.toMatch(/7-day protocol/i);
    expect(text).not.toMatch(/Weekly Evolution Report/i);
  });

  it('describes the ₹99 plan with its real features (daily mirror protocol + monthly re-audit)', () => {
    const planQ = faqLd.mainEntity.find((e) => /free versus the paid plan/.test(e.name));
    expect(planQ.acceptedAnswer.text).toMatch(/daily mirror protocol/);
    expect(planQ.acceptedAnswer.text).toMatch(/monthly re-audit/);
    expect(planQ.acceptedAnswer.text).toMatch(/₹99 per month/);
  });

  it('Organization logo points to an asset that exists in /public', () => {
    const org = blocks.find((b) => b['@type'] === 'Organization');
    expect(org.logo).toMatch(/maincharacter-mark-3d\.png$/);
    // file presence
    const logoPath = join(__dirname, '..', 'public', 'maincharacter-mark-3d.png');
    expect(() => readFileSync(logoPath)).not.toThrow();
  });

  it('does not ship placeholder social URLs in Organization.sameAs', () => {
    const org = blocks.find((b) => b['@type'] === 'Organization');
    const sameAs = org.sameAs || [];
    expect(sameAs.join(' ')).not.toMatch(/your-handle/);
  });
});
