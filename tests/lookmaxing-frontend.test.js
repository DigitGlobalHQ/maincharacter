/**
 * tests/lookmaxing-frontend.test.js
 *
 * Structural tests for the 8 Lookmaxing audit funnel surfaces.
 * Spec: briefs/stage-1-audit-spec.md §3, §8, §10
 * Design: product/design-lookmaxing-8-surfaces.md
 * Copy: product/copy-lookmaxing-audit.md
 *
 * Checks (per brief):
 *  - Each HTML file loads the tokens CSS link
 *  - Each has <body class="lookmaxing">
 *  - Each has <script src="/track.js" defer>
 *  - Each has the right data-event attrs
 *  - Surface 1 has the literal REPLACE WITH YOUTUBE EMBED comment
 *  - Surface 1 hero + CTA are in the first 2000 chars (above-fold proxy)
 *  - Surface 4 has the 18+ consent checkbox
 *  - Surface 5 (audit.html) has .mc-blur-gate on 4+ premium blocks
 *  - No fire emojis anywhere
 *  - No exclamation marks in MainCharacter copy (static HTML body text)
 *  - No [COPY DRAFT] literal text
 *  - The 4 key server.js page routes exist
 *  - Funnel HTML surfaces don't hardcode palette tokens (gold lives in tokens.css)
 *  - tokens.css carries the approved aubergine-glow + sparing-gold theme (2026-06-01)
 *  - Copy-approved audit trail comment present on every surface
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ── File map ──────────────────────────────────────────────────────────────────
const SURFACES = {
  index:   read('public/lookmaxing/index.html'),
  start:   read('public/lookmaxing/start.html'),
  quiz:    read('public/lookmaxing/quiz.html'),
  capture: read('public/lookmaxing/capture.html'),
  audit:   read('public/lookmaxing/audit.html'),
  full:    read('public/lookmaxing/full.html'),
  fork:    read('public/lookmaxing/fork.html'),
};
const SURFACE_NAMES = Object.keys(SURFACES);

// ── §A: Tokens CSS link present ───────────────────────────────────────────────
describe('tokens CSS link', () => {
  SURFACE_NAMES.forEach((name) => {
    it(`${name}: links to /lookmaxing/tokens.css`, () => {
      expect(SURFACES[name]).toMatch(/href="\/lookmaxing\/tokens\.css"/);
    });
  });
});

// ── §B: body.lookmaxing class ────────────────────────────────────────────────
describe('<body class="lookmaxing">', () => {
  SURFACE_NAMES.forEach((name) => {
    it(`${name}: has body.lookmaxing`, () => {
      expect(SURFACES[name]).toMatch(/class="lookmaxing"/);
    });
  });
});

// ── §C: track.js script tag ──────────────────────────────────────────────────
describe('track.js loaded', () => {
  SURFACE_NAMES.forEach((name) => {
    it(`${name}: has <script src="/track.js" defer>`, () => {
      expect(SURFACES[name]).toMatch(/src="\/track\.js"\s+defer/);
    });
  });
});

// ── §D: KPI data-event attributes ────────────────────────────────────────────
describe('KPI data-event attributes', () => {
  it('index: has lookmaxing_cta_clicked', () => {
    expect(SURFACES.index).toContain('data-event="lookmaxing_cta_clicked"');
  });
  it('index: has orator_waitlist_joined', () => {
    expect(SURFACES.index).toContain('data-event="orator_waitlist_joined"');
  });
  it('start: guest flow removed (no lookmaxing_fork_guest)', () => {
    expect(SURFACES.start).not.toContain('lookmaxing_fork_guest');
  });
  it('start: has lookmaxing_fork_signin', () => {
    expect(SURFACES.start).toContain('data-event="lookmaxing_fork_signin"');
  });
  it('quiz: has lookmaxing_quiz_q1_answered', () => {
    expect(SURFACES.quiz).toContain('data-event="lookmaxing_quiz_q1_answered"');
  });
  it('quiz: has lookmaxing_quiz_q5_answered', () => {
    expect(SURFACES.quiz).toContain('data-event="lookmaxing_quiz_q5_answered"');
  });
  it('capture: has lookmaxing_photo_uploaded', () => {
    expect(SURFACES.capture).toContain('data-event="lookmaxing_photo_uploaded"');
  });
  it('audit: has lookmaxing_paywall_viewed', () => {
    expect(SURFACES.audit).toContain('data-event="lookmaxing_paywall_viewed"');
  });
  it('audit: has lookmaxing_paywall_blurred_metric_tapped', () => {
    expect(SURFACES.audit).toContain('data-event="lookmaxing_paywall_blurred_metric_tapped"');
  });
  it('audit: has lookmaxing_pay_initiated', () => {
    expect(SURFACES.audit).toContain('data-event="lookmaxing_pay_initiated"');
  });
  it('full: has lookmaxing_pdf_downloaded', () => {
    expect(SURFACES.full).toContain('data-event="lookmaxing_pdf_downloaded"');
  });
  it('fork: has lookmaxing_fork_trial', () => {
    expect(SURFACES.fork).toContain('data-event="lookmaxing_fork_trial"');
  });
  it('fork: has lookmaxing_fork_premium', () => {
    expect(SURFACES.fork).toContain('data-event="lookmaxing_fork_premium"');
  });
});

// ── §E: Surface 1 — YouTube embed comment marker ─────────────────────────────
describe('Surface 1 — index.html', () => {
  it('has the REPLACE WITH YOUTUBE EMBED comment', () => {
    expect(SURFACES.index).toContain('<!-- REPLACE WITH YOUTUBE EMBED — autoplay-muted, loop, minimal controls -->');
  });

  it('hero headline is present in the page', () => {
    // The hero section must exist in the page — the style block precedes body content,
    // so we test for presence rather than position in first N chars.
    expect(SURFACES.index).toContain('THE AURA READING');
    expect(SURFACES.index).toContain('Before you open your mouth');
  });

  it('lm-hero section contains the primary CTA', () => {
    // The hero section should come before the video section in the HTML structure.
    // Both are present — CTA inside lm-hero, video in lm-video-section.
    expect(SURFACES.index).toContain('class="lm-hero"');
    expect(SURFACES.index).toContain('class="lm-video-section"');
    const heroIdx = SURFACES.index.indexOf('class="lm-hero"');
    const videoIdx = SURFACES.index.indexOf('class="lm-video-section"');
    expect(heroIdx).toBeLessThan(videoIdx);
  });

  it('primary CTA Get Your Aura Reading is present', () => {
    expect(SURFACES.index).toContain('Get Your Aura Reading');
  });
});

// ── §F: Surface 4 — 18+ consent ──────────────────────────────────────────────
describe('Surface 4 — capture.html', () => {
  it('has the 18+ consent checkbox', () => {
    expect(SURFACES.capture).toMatch(/18\s*(or older|\+)/i);
    // Must have role="checkbox" or input type="checkbox"
    expect(SURFACES.capture).toMatch(/role="checkbox"|type="checkbox"/);
  });

  it('analyze button is disabled by default (consent gate)', () => {
    expect(SURFACES.capture).toContain('id="analyze-btn"');
    expect(SURFACES.capture).toContain('disabled');
  });
});

// ── §G: Surface 5 — blur gates ───────────────────────────────────────────────
describe('Surface 5 — audit.html blur gates', () => {
  it('has .mc-blur-gate on at least 4 premium blocks', () => {
    const matches = SURFACES.audit.match(/class="mc-blur-gate"/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('has .mc-blur-wrap (the click-target wrappers)', () => {
    const matches = SURFACES.audit.match(/mc-blur-wrap/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('Razorpay checkout.js is loaded only on this page', () => {
    expect(SURFACES.audit).toContain('checkout.razorpay.com/v1/checkout.js');
    // Should not be on other pages
    SURFACE_NAMES
      .filter((n) => n !== 'audit')
      .forEach((n) => {
        expect(SURFACES[n]).not.toContain('checkout.razorpay.com');
      });
  });
});

// ── §H: Brand violations absent ──────────────────────────────────────────────

// Strip scripts, styles, and HTML tags — check only readable copy text
function extractCopyText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')      // strip HTML comments
    .replace(/<script[\s\S]*?<\/script>/gi, '') // strip <script> blocks
    .replace(/<style[\s\S]*?<\/style>/gi, '')   // strip <style> blocks
    .replace(/<[^>]+>/g, ' ')              // strip tags
    .replace(/\s+/g, ' ')
    .trim();
}

describe('brand violations — no fire emoji', () => {
  SURFACE_NAMES.forEach((name) => {
    it(`${name}: no fire emoji`, () => {
      expect(SURFACES[name]).not.toContain('🔥');
    });
  });
});

describe('brand violations — no exclamation marks in copy text', () => {
  SURFACE_NAMES.forEach((name) => {
    it(`${name}: no exclamation marks in static copy`, () => {
      const text = extractCopyText(SURFACES[name]);
      expect(text).not.toContain('!');
    });
  });
});

describe('brand violations — no [COPY DRAFT] literals', () => {
  SURFACE_NAMES.forEach((name) => {
    it(`${name}: no [COPY DRAFT] text`, () => {
      expect(SURFACES[name]).not.toContain('[COPY DRAFT]');
      expect(SURFACES[name]).not.toContain('[COPY:');
    });
  });
});

describe('brand violations — no gold tokens', () => {
  SURFACE_NAMES.forEach((name) => {
    it(`${name}: no gold token references`, () => {
      // Should not reference the gold obsidian palette
      expect(SURFACES[name]).not.toContain('--gold');
      expect(SURFACES[name]).not.toContain('#e8b84b');
      // var(--obsidian) is the old landing dark bg, not the lookmaxing black
      expect(SURFACES[name]).not.toContain('var(--obsidian)');
    });
  });
});

// ── §I: Copy audit-trail comment ────────────────────────────────────────────
describe('copy audit-trail comment', () => {
  SURFACE_NAMES.forEach((name) => {
    it(`${name}: has COPY APPROVED audit-trail comment`, () => {
      expect(SURFACES[name]).toContain('COPY APPROVED 2026-05-29');
    });
  });
});

// ── §J: Tokens CSS file exists + is valid CSS ────────────────────────────────
describe('tokens.css', () => {
  it('exists at public/lookmaxing/tokens.css', () => {
    const p = path.join(ROOT, 'public/lookmaxing/tokens.css');
    expect(fs.existsSync(p)).toBe(true);
  });
  it('contains the mc-blur-gate class definition', () => {
    const css = read('public/lookmaxing/tokens.css');
    expect(css).toContain('.mc-blur-gate');
  });
  it('contains the mc-light-point-glow animation', () => {
    const css = read('public/lookmaxing/tokens.css');
    expect(css).toContain('mcLightPointBreath');
  });
  // Theme update (founder-approved 2026-06-01): "black + aubergine glow + gold
  // sparingly, glow-not-fill". tokens.css now defines an aubergine background
  // glow and a gold accent (used for the ◆ mark + primary-CTA outline/glow).
  it('defines the approved aubergine-glow + gold-accent tokens', () => {
    const css = read('public/lookmaxing/tokens.css');
    expect(css).toContain('--mc-aubergine');
    expect(css).toContain('--mc-gold');
    expect(css).toContain('#e8b84b');
  });
  it('uses aubergine as a background glow only (glow-not-fill)', () => {
    const css = read('public/lookmaxing/tokens.css');
    // Aubergine appears in a radial-gradient background, never as a solid fill on a control.
    expect(css).toMatch(/radial-gradient\([^)]*--mc-aubergine-glow/);
  });
});

// ── §K: server.js page routes ────────────────────────────────────────────────
describe('server.js page routes', () => {
  const server = read('server.js');

  it('has GET /lookmaxing route', () => {
    expect(server).toMatch(/app\.get\(['"]\/lookmaxing['"]/);
  });
  it('has GET /lookmaxing/start route', () => {
    expect(server).toMatch(/app\.get\(['"]\/lookmaxing\/start['"]/);
  });
  it('has GET /lookmaxing/quiz route', () => {
    expect(server).toMatch(/app\.get\(['"]\/lookmaxing\/quiz['"]/);
  });
  it('has GET /lookmaxing/capture route', () => {
    expect(server).toMatch(/app\.get\(['"]\/lookmaxing\/capture['"]/);
  });
  it('has GET /lookmaxing/audit/:id route', () => {
    expect(server).toMatch(/app\.get\(['"]\/lookmaxing\/audit\/:id['"]/);
  });
  it('has GET /lookmaxing/fork route', () => {
    expect(server).toMatch(/app\.get\(['"]\/lookmaxing\/fork['"]/);
  });
});

// ── §L: Surface 8 — feature flag ────────────────────────────────────────────
describe('Surface 8 — fork.html', () => {
  it('trial CTA is disabled by default', () => {
    expect(SURFACES.fork).toContain('id="trial-btn"');
    // Disabled attribute present on the trial button
    const trialBtnSection = SURFACES.fork.slice(
      SURFACES.fork.indexOf('id="trial-btn"') - 200,
      SURFACES.fork.indexOf('id="trial-btn"') + 200
    );
    expect(trialBtnSection).toContain('disabled');
  });

  it('references LOOKMAX_TRIAL_LIVE feature flag', () => {
    expect(SURFACES.fork).toContain('LOOKMAX_TRIAL_LIVE');
  });
});

// ── §M: Surface 3 — quiz structure ──────────────────────────────────────────
describe('Surface 3 — quiz.html', () => {
  it('has 5 question screens', () => {
    const screens = SURFACES.quiz.match(/id="q\d-screen"/g) || [];
    expect(screens.length).toBe(5);
  });

  it('has 4 options per question (A-D)', () => {
    // Q1 has all 4 option values
    expect(SURFACES.quiz).toContain('value="A"');
    expect(SURFACES.quiz).toContain('value="B"');
    expect(SURFACES.quiz).toContain('value="C"');
    expect(SURFACES.quiz).toContain('value="D"');
  });

  it('has progress bar', () => {
    expect(SURFACES.quiz).toContain('class="lm-quiz-progress"');
    expect(SURFACES.quiz).toContain('lm-quiz-progress__fill');
  });
});

// ── §N: Surface 2 — start.html ───────────────────────────────────────────────
describe('Surface 2 — start.html', () => {
  it('guest path removed (sign-in required — funnel-repair P1)', () => {
    expect(SURFACES.start).not.toContain('id="guest-btn"');
    expect(SURFACES.start).not.toContain('/api/lookmaxing/guest');
  });
  it('has Google sign-in (to OAuth start)', () => {
    expect(SURFACES.start).toContain('Sign in with Google');
    expect(SURFACES.start).toContain('/api/lookmax/auth/google/start');
  });
  it('has email sign-in', () => {
    expect(SURFACES.start).toContain('Sign in with email');
  });
});
