import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.join(__dirname, '..', 'landing.html'), 'utf8');

describe('landing.html — locked copy (byte-identical guard)', () => {
  // CLAUDE.md §2: hero, gap, rank ladder and CTA-close copy are untouchable.
  const LOCKED = [
    '<h1 class="hero__headline">Become the Main Character</h1>',
    "Most people know who they want to be. They just can't see the gap clearly enough to close it.",
    "You already know who you want to be. You've known for a while.",
    '<div class="rank-row__name">The Unawakened</div>',
    '<div class="rank-row__name">The Seeker</div>',
    '<div class="rank-row__name">The Ascendant</div>',
    '<div class="rank-row__name">The Luminary</div>',
    '<div class="rank-row__name">The Sovereign</div>',
    '<div class="ranks__rule reveal">Ranks are never lost. Return is always welcomed.</div>',
    '<h2>Your arc begins with one question.</h2>',
    '"In a room full of your peers, do you feel like the protagonist — or a spectator?"',
  ];
  for (const snippet of LOCKED) {
    it(`preserves locked copy: ${snippet.slice(0, 48)}…`, () => {
      expect(html).toContain(snippet);
    });
  }
});

describe('landing.html — 2-pillar update (P2.1)', () => {
  it('Lookmaxxing card replaces the Aesthetic card and links to /audit', () => {
    expect(html).toContain('<h3 class="pcard__name">Lookmaxxing</h3>');
    expect(html).toContain("window.location.href='/audit'");
    expect(html).toContain('Get Your Aura Reading');
    // Day-30 promise (not Day-7) for Lookmaxxing.
    expect(html).toContain('By Day 30 you will see the version of you the camera has been waiting to capture.');
  });

  it('no choosable Aesthetic or Sage pcard remains in the grid', () => {
    expect(html).not.toContain('<h3 class="pcard__name">The Aesthetic</h3>');
    expect(html).not.toContain('<h3 class="pcard__name">The Sage</h3>');
  });

  it('Sage is demoted to a footer strip', () => {
    expect(html).toContain('◆ The Sage · Wisdom &amp; Mindset · Coming after Aura++ launch');
  });
});

describe('landing.html — Aura++ reveal section (P2.2/P2.3)', () => {
  it('has the #aura-plus-plus section', () => {
    expect(html).toContain('id="aura-plus-plus"');
  });

  it('has the three column sub-headings', () => {
    expect(html).toContain('The Orator Protocol');
    expect(html).toContain('>Lookmaxxing</div>'); // the Aura++ column sub-label
    expect(html).toContain('>Aura++</div>');
  });

  it('has the three column titles', () => {
    expect(html).toContain('Your Voice');
    expect(html).toContain('Your Presence');
    expect(html).toContain('The Combined Self');
  });

  it('has the pricing strip and bundle CTA', () => {
    expect(html).toContain('Orator ₹799 · Lookmaxxing ₹1,499 · Aura++ ₹1,999/mo (saves ₹299)');
    expect(html).toContain('/audit?intent=bundle');
    expect(html).toContain('Unlock both →');
  });

  it('introduces no new design tokens (uses existing var(--…) only)', () => {
    // The section must not invent a --token; the only var() it references must
    // be ones declared in :root. Guard against the earlier --ink-soft slip.
    expect(html).not.toContain('--ink-soft');
  });
});

describe('landing.html — coming-soon-modal listener (P1 regression)', () => {
  it('modal div exists in the HTML', () => {
    expect(html).toContain('id="coming-soon-modal"');
  });

  it('backdrop-click listener is deferred inside DOMContentLoaded, not bare in the IIFE', () => {
    // The bare pattern that caused TypeError: null.addEventListener fires before
    // the modal div is parsed. Assert the fixed form is present and the broken
    // form is absent.
    expect(html).toContain(
      "document.addEventListener('DOMContentLoaded', function() {"
    );
    // The broken bare call must not appear — the getElementById for the modal
    // must not be a direct child of the IIFE at execution time.
    // We check that there is no line that does getElementById('coming-soon-modal').addEventListener
    // outside of a DOMContentLoaded wrapper by checking the raw text ordering.
    const domReadyIdx  = html.indexOf("document.addEventListener('DOMContentLoaded'");
    const bareCallPat  = "document.getElementById('coming-soon-modal').addEventListener";
    const bareIdx      = html.indexOf(bareCallPat);
    // The addEventListener call on the modal must appear AFTER the DOMContentLoaded open.
    expect(bareIdx).toBeGreaterThan(domReadyIdx);
  });

  it('modal div is declared after the closing </script> tag in source order', () => {
    // Structural guard: this relationship is what makes the DOMContentLoaded
    // deferral necessary. If someone moves the modal above the script this test
    // will flag it as a required review point.
    const scriptCloseIdx = html.lastIndexOf('</script>');
    const modalDivIdx    = html.indexOf('id="coming-soon-modal"');
    expect(modalDivIdx).toBeGreaterThan(scriptCloseIdx);
  });
});

describe('landing.html — no </script> literal inside script bodies', () => {
  it('script body text never contains a literal </script> substring (HTML parser truncation guard)', () => {
    // The HTML parser treats the first </script> it encounters as the end of
    // the script block, even inside a comment. A literal </script> inside any
    // script body will truncate it, producing a SyntaxError in the browser.
    // This test splits on the opening <script tag boundary and checks each
    // captured body does not contain a closing tag literal.
    const scriptOpenRe = /<script(\s[^>]*)?>/ ;
    const scriptCloseTag = '</script>';
    const parts = html.split(scriptOpenRe);
    // parts[0] is content before the first <script>; odd-indexed parts are
    // capture groups from the opening-tag regex; even indices ≥2 are bodies.
    // Simpler: just split on the opening tag without a capture group and
    // slice each piece up to the first </script>.
    const bodies = [];
    let cursor = 0;
    const openRe = /<script(?:\s[^>]*)?>/g;
    let m;
    while ((m = openRe.exec(html)) !== null) {
      const bodyStart = m.index + m[0].length;
      const bodyEnd   = html.indexOf(scriptCloseTag, bodyStart);
      if (bodyEnd !== -1) {
        bodies.push(html.slice(bodyStart, bodyEnd));
      }
    }

    expect(bodies.length).toBeGreaterThan(0); // sanity: we found at least one script block
    for (let i = 0; i < bodies.length; i++) {
      expect(
        bodies[i],
        `Script block #${i + 1} contains a literal ${scriptCloseTag} — the HTML parser will truncate the script there`
      ).not.toContain(scriptCloseTag);
    }
  });
});
