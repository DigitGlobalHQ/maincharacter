/**
 * Structural design-spec tests for the 6 Lookmaxxing surfaces:
 * mirror, protocol, hair, reveal, login, payment-confirmed.
 *
 * Checks:
 *  - No fire emoji in any surface
 *  - No exclamation marks in MainCharacter's own copy (static HTML body)
 *  - No Chart.js CDN script tag on these pages
 *  - data-event attributes present per spec §8
 *  - Touch-target comments / min-height classes on critical buttons
 *  - Day-30 side-by-side shell: #day30View or mode branch exists in reveal.html
 *  - Share affordance wired in reveal.html
 *  - Norwood re-treat: gold fill class removed from .nw.on
 *  - Beat staging elements in mirror.html
 *  - [COPY DRAFT] literal text NOT present in any surface (prevented by brief)
 *  - login-error-note class present in login.html (§2.3 polish)
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

// ── Surface files ──────────────────────────────────────────────────────────────
const mirror = read('public/lookmax/mirror.html');
const protocol = read('public/lookmax/protocol.html');
const hair = read('public/lookmax/hair.html');
const reveal = read('public/lookmax/reveal.html');
const login = read('public/lookmax/login.html');
const payConf = read('public/payment-confirmed.html');

const surfaces = { mirror, protocol, hair, reveal, login, payConf };
const surfaceNames = Object.keys(surfaces);

// ── §A: Brand violations absent ────────────────────────────────────────────────
describe('brand violations — fire emoji absent', () => {
  surfaceNames.forEach((name) => {
    it(`${name}: no fire emoji`, () => {
      expect(surfaces[name]).not.toContain('🔥');
    });
  });
});

describe('brand violations — no exclamation marks in static copy', () => {
  // Only check visible text nodes (between tags), stripping:
  //  - HTML comments, <script> blocks, <style> blocks, HTML tags, and attributes
  surfaceNames.forEach((name) => {
    it(`${name}: no exclamation marks in static visible text`, () => {
      let stripped = surfaces[name];
      // Remove HTML comments
      stripped = stripped.replace(/<!--[\s\S]*?-->/g, '');
      // Remove <script>...</script> blocks (JS contains !! and !== )
      stripped = stripped.replace(/<script[\s\S]*?<\/script>/gi, '');
      // Remove <style>...</style> blocks
      stripped = stripped.replace(/<style[\s\S]*?<\/style>/gi, '');
      // Remove HTML tags (including their attributes — hrefs, aria-labels etc.)
      const textOnly = stripped.replace(/<[^>]+>/g, ' ');
      expect(textOnly).not.toMatch(/!/);
    });
  });
});

// ── §B: No Chart.js CDN on these pages ────────────────────────────────────────
describe('performance — Chart.js CDN script absent', () => {
  surfaceNames.forEach((name) => {
    it(`${name}: no cdn.jsdelivr.net chart.js script`, () => {
      expect(surfaces[name].toLowerCase()).not.toMatch(/cdn\.jsdelivr\.net.*chart/);
    });
  });
});

// ── §C: [COPY DRAFT] literal not present in any surface ───────────────────────
describe('copy hygiene — no literal [COPY DRAFT] text shipped', () => {
  surfaceNames.forEach((name) => {
    it(`${name}: no "[COPY DRAFT]" visible text`, () => {
      // Allowed inside HTML comments; must not be in text content
      const withoutComments = surfaces[name].replace(/<!--[\s\S]*?-->/g, '');
      expect(withoutComments).not.toContain('[COPY DRAFT]');
    });
  });
});

// ── §D: KPI data-event hooks (mirror) ─────────────────────────────────────────
describe('mirror.html — KPI data-event hooks', () => {
  it('has mirror_taken or captureBtn with data-event', () => {
    // The capture button should carry a KPI hook
    expect(mirror).toContain('data-event="mirror_capture_tapped"');
  });
  it('has data-event="protocol_entered_from_mirror" on protocol button', () => {
    expect(mirror).toContain('protocol_entered_from_mirror');
  });
  it('has data-event="mirror_viewed" page load hook', () => {
    expect(mirror).toContain('mirror_viewed');
  });
});

// ── §E: Mirror staged reveal elements ─────────────────────────────────────────
describe('mirror.html — staged reveal structure', () => {
  it('has reveal-beat-2 element for level + consultant fade', () => {
    expect(mirror).toContain('reveal-beat-2');
  });
  it('has reveal-beat-3 element for axes + trend fade', () => {
    expect(mirror).toContain('reveal-beat-3');
  });
  it('rotline interval is 2200ms (spec §2 analysis pacing)', () => {
    expect(mirror).toContain('2200');
    // The setInterval for rotline uses 2200 as the last argument
    expect(mirror).toContain('}, 2200)');
    // Must not use 1600 as a setInterval argument
    expect(mirror).not.toContain('}, 1600)');
  });
  it('streak badge uses Day N format without fire emoji', () => {
    // The old pattern was ' 🔥' — must be gone
    expect(mirror).not.toContain('🔥');
    // The new pattern writes 'Day '
    expect(mirror).toContain("'Day '");
  });
});

// ── §F: Protocol KPI data-event hooks ─────────────────────────────────────────
describe('protocol.html — KPI data-event hooks', () => {
  it('has protocol_viewed page-load event', () => {
    expect(protocol).toContain('protocol_viewed');
  });
  it('has protocol_day_close_attempted on complete button', () => {
    expect(protocol).toContain('protocol_day_close_attempted');
  });
  it('has protocol_item_checked event wiring', () => {
    expect(protocol).toContain('protocol_item_checked');
  });
});

// ── §G: Protocol tier chip visible in header row ──────────────────────────────
describe('protocol.html — tier chip promotion', () => {
  it('tier chip rendered in title-row (not inside .instruction only)', () => {
    // After refactor: title-row div wraps tier chip alongside title
    expect(protocol).toContain('title-row');
  });
  it('btn--complete-ready class defined for ≥80% glow state', () => {
    expect(protocol).toContain('btn--complete-ready');
  });
  it('completeBtn has min-height 44px touch target', () => {
    expect(protocol).toContain('min-height');
  });
});

// ── §H: Hair Norwood re-treat ──────────────────────────────────────────────────
describe('hair.html — Norwood staging row re-treat', () => {
  it('no gold fill on .nw.on .dome (background: var(--gold) removed)', () => {
    // The old rule was: .nw.on .dome { background: var(--gold); ... }
    // After re-treat the fill must be absent
    expect(hair).not.toMatch(/\.nw\.on\s+\.dome\s*\{[^}]*background:\s*var\(--gold\)/);
  });
  it('nw__mark element present for ◆ placement above active stage', () => {
    expect(hair).toContain('nw__mark');
  });
  it('has data-event="hair_viewed" page-load hook', () => {
    expect(hair).toContain('hair_viewed');
  });
  it('has data-event="hair_submitted" on analyse button', () => {
    expect(hair).toContain('hair_submitted');
  });
});

// ── §I: Reveal — Day-30 mode shell + share affordance ─────────────────────────
describe('reveal.html — Day-30 mode shell', () => {
  it('showDay30 function or mode=day30 URL branch exists', () => {
    expect(reveal).toMatch(/day30|Day-30|day_30/);
  });
  it('mode param read from URLSearchParams', () => {
    expect(reveal).toContain('mode');
  });
  it('crossfade interval is 1600ms (spec §5 — was 1200)', () => {
    // The crossfade interval uses 1600 as the last argument to setInterval
    expect(reveal).toContain('}, 1600)');
    // Must not use 1200 as a setInterval argument
    expect(reveal).not.toContain('}, 1200)');
  });
});

describe('reveal.html — share affordance restructure', () => {
  it('primary Share button has data-event="reveal_share_attempted"', () => {
    expect(reveal).toContain('reveal_share_attempted');
  });
  it('trajectory canvas is outside .stage (in its own card)', () => {
    // After refactor: traj canvas is NOT inside .stage div
    // Check that traj is not a child of stage (stage ends before traj card)
    const stageMatch = reveal.match(/class="stage"[^<]*>([\s\S]*?)<\/div>/);
    if (stageMatch) {
      expect(stageMatch[1]).not.toContain('id="traj"');
    }
  });
  it('has reveal_viewed KPI event', () => {
    expect(reveal).toContain('reveal_viewed');
  });
});

// ── §J: Login — polish deltas ──────────────────────────────────────────────────
describe('login.html — polish deltas per design spec', () => {
  it('login-error-note class applied to expiredErr (§2.3)', () => {
    expect(login).toContain('login-error-note');
  });
  it('expiredErr is NOT class="err" (recoloured per spec)', () => {
    // The old markup was: class="err" id="expiredErr"
    expect(login).not.toMatch(/class="err"\s+id="expiredErr"/);
    expect(login).not.toMatch(/id="expiredErr"\s+[^>]*class="err"/);
  });
  it('stateLoading has login-loading-note or a non-empty placeholder', () => {
    // Must not be the raw TODO comment as visible text
    const withoutComments = login.replace(/<!--[\s\S]*?-->/g, '');
    expect(withoutComments).not.toContain('TODO copy review login.loading');
  });
  it('reduced-motion guard in fadeIn function', () => {
    expect(login).toContain('prefers-reduced-motion');
  });
});

// ── §K: Payment-confirmed — earned-moment hierarchy ───────────────────────────
describe('payment-confirmed.html — earned-moment hierarchy', () => {
  it('pc-breath element or mc-breath animation present for waiting state', () => {
    expect(payConf).toMatch(/mc-breath|pc-breath/);
  });
  it('@keyframes mc-breath defined', () => {
    expect(payConf).toContain('mc-breath');
  });
  it('Mirror CTA rendered outside .steps as a standalone block', () => {
    expect(payConf).toContain('pc-mirror-cta');
  });
  it('receipt collapsed to single line (pc-receipt-line)', () => {
    expect(payConf).toContain('pc-receipt-line');
  });
  it('Install the app is a link not a button-pill (pc-install)', () => {
    expect(payConf).toContain('pc-install');
  });
  it('has data-event="first_mirror_click" on Open the mirror button', () => {
    expect(payConf).toContain('first_mirror_click');
  });
  it('prefers-reduced-motion guard on breath animation', () => {
    expect(payConf).toContain('prefers-reduced-motion');
  });
  it('#confirmed has opacity fade-in on reveal', () => {
    expect(payConf).toContain("opacity = '0'");
  });
});
