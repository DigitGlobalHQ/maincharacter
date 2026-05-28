/**
 * NOW-3 Paywall UI tests.
 * Source-scan tests — read paywall.html as text and assert structural guarantees.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const paywallSrc = fs.readFileSync(
  path.resolve(__dirname, '../public/paywall.html'),
  'utf8'
);

// ─── Aura++ card bullet count ────────────────────────────────────────────────

describe('Aura++ card bullets', () => {
  it('does NOT contain the unapproved Consultant chat bullet in the card markup', () => {
    // Strip HTML comments before checking — the comment header may note the removal
    const noComments = paywallSrc.replace(/<!--[\s\S]*?-->/g, '');
    expect(noComments).not.toContain('Consultant chat');
    expect(noComments).not.toContain('Founder access to The Consultant');
  });

  it('has exactly 5 li items inside the Aura++ card', () => {
    // Extract exactly the Aura++ card section using the id anchor
    const auraStart = paywallSrc.indexOf('id="card-aura"');
    // The card ends before the closing </div> of the cards grid — find the form section start
    const formStart = paywallSrc.indexOf('class="form"');
    const auraSection = paywallSrc.slice(auraStart, formStart);
    const liMatches = auraSection.match(/<li>/g);
    expect(liMatches).not.toBeNull();
    expect(liMatches.length).toBe(5);
  });

  it('retains the 5 expected approved bullets', () => {
    expect(paywallSrc).toContain('Everything in The Orator');
    expect(paywallSrc).toContain('Everything in Lookmaxxing');
    expect(paywallSrc).toContain('Weekly Evolution Reports');
    expect(paywallSrc).toContain('Rank progression');
    expect(paywallSrc).toContain('Day-30 Re-Audit');
  });
});

// ─── Aura++ tag A/B hook ─────────────────────────────────────────────────────

describe('Aura++ tag A/B variant bucket', () => {
  it('contains the variant allowlist with all three variants', () => {
    expect(paywallSrc).toContain('most_chosen');
    expect(paywallSrc).toContain('saves_299');
    expect(paywallSrc).toContain('voice_presence_arc');
  });

  it('reads/writes variant to localStorage', () => {
    expect(paywallSrc).toContain('mc.paywall.variant');
  });

  it('has no hardcoded scarcity or urgency strings', () => {
    expect(paywallSrc).not.toMatch(/only \d+ left/i);
    expect(paywallSrc).not.toMatch(/limited time/i);
    expect(paywallSrc).not.toMatch(/hurry/i);
    expect(paywallSrc).not.toMatch(/\d+ people chose/i);
  });
});

// ─── clip fix ────────────────────────────────────────────────────────────────

describe('Aura++ card 1440px clip fix', () => {
  it('applies margin-inline to .cards at min-width 1280px', () => {
    expect(paywallSrc).toContain('1280px');
    // Should have margin on .cards at wide breakpoint
    expect(paywallSrc).toMatch(/1280px[\s\S]{0,200}\.cards/);
  });

  it('tag pill has max-width to prevent overflow', () => {
    expect(paywallSrc).toContain('max-width: calc(100% - 24px)');
  });
});

// ─── intent=bundle pre-select ────────────────────────────────────────────────

describe('intent=bundle pre-select', () => {
  it('contains the bundle intent handling', () => {
    // params.get('intent') === 'bundle' — note the ) between intent' and ===
    expect(paywallSrc).toContain("intent') === 'bundle'");
  });
});

// ─── no exclamation marks in user-visible copy strings ──────────────────────

describe('brand voice — no exclamation marks in visible copy', () => {
  it('has no exclamation marks in textContent strings (li, h1, h2)', () => {
    // Extract content from visible text elements only.
    const liTexts = (paywallSrc.match(/<li>([\s\S]*?)<\/li>/g) || []).join('');
    const h1Texts = (paywallSrc.match(/<h1>([\s\S]*?)<\/h1>/g) || []).join('');
    const h2Texts = (paywallSrc.match(/<h2>([\s\S]*?)<\/h2>/g) || []).join('');
    const combined = liTexts + h1Texts + h2Texts;
    expect(combined).not.toContain('!');
  });
});
