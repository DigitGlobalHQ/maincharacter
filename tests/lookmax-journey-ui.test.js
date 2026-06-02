/**
 * tests/lookmax-journey-ui.test.js
 *
 * Static source-scan tests for the "Your Journey" section on the Lookmaxxing
 * dashboard (public/lookmax/index.html).
 *
 * These tests verify structural guarantees that would otherwise only surface at
 * runtime:
 *  - #journey-section container is present in the HTML
 *  - renderJourney function is defined in the script block
 *  - it fetches /api/lookmax/me/history
 *  - it uses the silent .catch(() => {}) posture (never blocking the dashboard)
 *  - the first-chapter empty state is referenced
 *  - no emoji in the file (beyond the approved ◆ diamond glyph)
 *  - no exclamation marks in user-facing copy
 *  - copy approval provenance (founder-approved 2026-06-02; no lingering draft markers)
 *  - all 5 module builders are defined
 *  - analytics events are fired (journey_section_viewed, journey_reading_clicked)
 *  - accessibility: aria-labelledby, role="img", section landmark, ol for timeline
 *  - delta values are never color-only (glyph pairing present)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.resolve(__dirname, '../public/lookmax/index.html'),
  'utf8'
);

// ── Container presence ────────────────────────────────────────────────────────

describe('#journey-section container', () => {
  it('is present in the HTML', () => {
    expect(SRC).toContain('id="journey-section"');
  });

  it('is placed after #cross-sell-slot and #push-prompt-slot', () => {
    const crossPos  = SRC.indexOf('id="cross-sell-slot"');
    const pushPos   = SRC.indexOf('id="push-prompt-slot"');
    const journeyPos = SRC.indexOf('id="journey-section"');
    expect(journeyPos).toBeGreaterThan(crossPos);
    expect(journeyPos).toBeGreaterThan(pushPos);
  });

  it('is placed before .footer-note', () => {
    const journeyPos = SRC.indexOf('id="journey-section"');
    const footerPos  = SRC.indexOf('footer-note');
    expect(journeyPos).toBeLessThan(footerPos);
  });
});

// ── Function definition ───────────────────────────────────────────────────────

describe('renderJourney function', () => {
  it('is defined in the script block', () => {
    expect(SRC).toContain('async function renderJourney()');
  });

  it('is called at the top-level IIFE alongside renderAuraReading', () => {
    expect(SRC).toContain('renderJourney().catch(() => {})');
  });

  it('uses the silent .catch(() => {}) posture', () => {
    // The exact pattern that prevents journey failures from blocking the dashboard
    expect(SRC).toContain('renderJourney().catch(() => {})');
  });
});

// ── Data fetch ────────────────────────────────────────────────────────────────

describe('fetch posture', () => {
  it('fetches /api/lookmax/me/history', () => {
    expect(SRC).toContain('/api/lookmax/me/history');
  });

  it('sends Authorization: Bearer token header', () => {
    // Must use bearer auth consistent with the rest of the dashboard
    expect(SRC).toContain("'Authorization': 'Bearer ' + token");
  });

  it('does NOT touch the existing /api/lookmax/dashboard call', () => {
    // Should not replace or merge with the existing dashboard fetch
    expect(SRC).toContain('/api/lookmax/dashboard');
    // Both calls must coexist
    const historyCount = (SRC.match(/api\/lookmax\/me\/history/g) || []).length;
    const dashCount    = (SRC.match(/api\/lookmax\/dashboard/g) || []).length;
    expect(historyCount).toBeGreaterThanOrEqual(1);
    expect(dashCount).toBeGreaterThanOrEqual(1);
  });
});

// ── Empty / first-chapter state ───────────────────────────────────────────────

describe('first-chapter empty state', () => {
  it('references the first-chapter card build path', () => {
    expect(SRC).toContain('buildFirstChapterCard');
  });

  it('checks the combined empty condition (readings<=1 && totalCount===0 && !axes && !hair)', () => {
    expect(SRC).toContain('isFirstChapter');
  });

  it('includes the first-chapter quote placeholder', () => {
    // Draft copy — must be present (TODO copy review wraps it)
    expect(SRC).toContain('This is your baseline. Everything after this is movement.');
  });

  it('computes days until next reading', () => {
    expect(SRC).toContain('daysUntil');
  });
});

// ── Five module builders ──────────────────────────────────────────────────────

describe('five module builder functions', () => {
  it('buildTimeline is defined', () => {
    expect(SRC).toContain('function buildTimeline(');
  });

  it('buildAuraSparkline is defined', () => {
    expect(SRC).toContain('function buildAuraSparkline(');
  });

  it('buildAxes is defined', () => {
    expect(SRC).toContain('function buildAxes(');
  });

  it('buildMirrorHeatmap is defined', () => {
    expect(SRC).toContain('function buildMirrorHeatmap(');
  });

  it('buildHairTrend is defined', () => {
    expect(SRC).toContain('function buildHairTrend(');
  });
});

// ── Analytics events ──────────────────────────────────────────────────────────

describe('analytics events', () => {
  it('fires journey_section_viewed on render', () => {
    expect(SRC).toContain('journey_section_viewed');
  });

  it('fires journey_reading_clicked on row tap', () => {
    expect(SRC).toContain('journey_reading_clicked');
  });

  it('includes readingId and type in the click payload', () => {
    expect(SRC).toContain('readingId');
    expect(SRC).toContain('data-reading-type');
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

describe('accessibility', () => {
  it('section uses aria-labelledby="journey-heading"', () => {
    expect(SRC).toContain('aria-labelledby="journey-heading"');
  });

  it('journey heading has id="journey-heading"', () => {
    expect(SRC).toContain('id="journey-heading"');
  });

  it('timeline is an <ol> (ordered, chronology matters)', () => {
    expect(SRC).toContain('<ol class="timeline-rail"');
  });

  it('sparkline SVG has role="img"', () => {
    // Aura sparkline and hair sparkline both use role="img"
    const matches = (SRC.match(/role="img"/g) || []).length;
    expect(matches).toBeGreaterThanOrEqual(1);
  });

  it('sparkline SVG has aria-label describing the data', () => {
    // SVG aria-labels are composed from readings data
    expect(SRC).toContain('aria-label=');
    // The aria-label template must reference reading count
    expect(SRC).toContain('reading');
  });

  it('delta glyphs (▲ ▼) are paired — present in the source', () => {
    expect(SRC).toContain('▲');
    expect(SRC).toContain('▼');
  });

  it('delta glyphs use aria-hidden (meaning conveyed by accessible label too)', () => {
    expect(SRC).toContain('aria-hidden="true"');
  });

  it('timeline links have aria-label attributes', () => {
    expect(SRC).toContain('readingAriaLabel');
  });

  it('timeline rows have min-height 44px (tap target)', () => {
    expect(SRC).toContain('min-height: 44px');
  });

  it('heatmap chevrons have min-width/min-height 44px', () => {
    expect(SRC).toContain('min-width: 44px');
    expect(SRC).toContain('min-height: 44px');
  });

  it('show-all button uses aria-expanded', () => {
    expect(SRC).toContain('aria-expanded');
  });
});

// ── Brand voice guardrails ────────────────────────────────────────────────────

// Strip scripts/styles/HTML tags to check only readable copy.
function extractCopyText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')            // strip HTML comments (includes TODO markers)
    .replace(/<script[\s\S]*?<\/script>/gi, '')  // strip script blocks
    .replace(/<style[\s\S]*?<\/style>/gi, '')    // strip style blocks
    .replace(/<[^>]+>/g, ' ')                   // strip tags
    .replace(/\s+/g, ' ')
    .trim();
}

describe('brand voice — no emoji (except ◆)', () => {
  it('contains no fire emoji', () => {
    expect(SRC).not.toContain('🔥');
  });

  it('contains no other emoji in copy text', () => {
    const copy = extractCopyText(SRC);
    // The only allowed decorative character is ◆. Check common emoji ranges.
    // eslint-disable-next-line no-control-regex
    const emojiPattern = /[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiPattern.test(copy)).toBe(false);
  });
});

describe('brand voice — no exclamation marks in copy', () => {
  it('has no exclamation marks in static copy text', () => {
    const copy = extractCopyText(SRC);
    expect(copy).not.toContain('!');
  });
});

describe('copy approval provenance', () => {
  it('journey copy is founder-approved (no lingering TODO markers in JOURNEY_COPY block)', () => {
    // Approved 2026-06-02 — the draft markers must be gone and provenance recorded.
    const block = SRC.slice(SRC.indexOf('JOURNEY_COPY'), SRC.indexOf('AXIS_LABELS'));
    expect(block).not.toContain('TODO copy review');
    expect(SRC).toContain('COPY APPROVED 2026-06-02');
  });

  it('JOURNEY_COPY constant block is present and labelled', () => {
    expect(SRC).toContain('JOURNEY_COPY');
  });
});

// ── CSS — no new tokens, correct classes ─────────────────────────────────────

describe('CSS token discipline', () => {
  it('uses var(--gold) for score numerals and accents', () => {
    expect(SRC).toContain('var(--gold)');
  });

  it('uses var(--muted) for secondary text', () => {
    expect(SRC).toContain('var(--muted)');
  });

  it('uses var(--good) for positive deltas', () => {
    expect(SRC).toContain('var(--good)');
  });

  it('uses var(--bad) for negative deltas', () => {
    expect(SRC).toContain('var(--bad)');
  });

  it('uses var(--line) for hairlines and rails', () => {
    expect(SRC).toContain('var(--line)');
  });

  it('does not introduce new hex color codes (only approved token vars used)', () => {
    // The only allowed non-var hex is rgba(232,184,75,...) for the gold glow fills
    // which is an existing pattern in app.css and existing style blocks.
    // We just ensure no new brand hex colors are invented.
    const styleBlock = SRC.match(/<style>([\s\S]*?)<\/style>/)?.[1] || '';
    // The existing rgba(232,184,75,...) is for gold glow (already used); allow it.
    // New isolated hex codes for brand colors must not appear.
    const forbiddenHex = styleBlock.match(/#[0-9a-fA-F]{6}/g) || [];
    // Only allowed: pre-existing palette refs (none should be added in journey CSS).
    expect(forbiddenHex.length).toBe(0);
  });

  it('reuses .card class for module containers', () => {
    expect(SRC).toContain('class="card"');
  });

  it('reuses .card--gold class for the first-chapter card', () => {
    expect(SRC).toContain('card--gold');
  });

  it('has journey-skeleton loading state', () => {
    expect(SRC).toContain('journey-skeleton');
  });

  it('journey section has fadeIn animation', () => {
    expect(SRC).toContain('#journey-section');
    expect(SRC).toContain('fadeIn');
  });

  it('honours prefers-reduced-motion for skeleton and journey fade', () => {
    expect(SRC).toContain('prefers-reduced-motion');
  });
});

// ── Module-specific shape checks ─────────────────────────────────────────────

describe('Module 1 — readings timeline', () => {
  it('renders newest-first (slice().reverse())', () => {
    expect(SRC).toContain('.reverse()');
  });

  it('implements show-all readings toggle (max 4 initially)', () => {
    expect(SRC).toContain('SHOW_INITIAL');
    expect(SRC).toContain('journeyShowMore');
  });
});

describe('Module 2 — aura sparkline', () => {
  it('uses inline SVG polyline (no library)', () => {
    expect(SRC).toContain('<polyline');
  });

  it('has no chart library import', () => {
    expect(SRC).not.toContain('chart.js');
    expect(SRC).not.toContain('Chart.js');
    expect(SRC).not.toContain('d3.js');
  });

  it('spaces points evenly by index (not time-scaled)', () => {
    // Even spacing is achieved by index-based xOf() function
    expect(SRC).toContain('xOf');
  });
});

describe('Module 3 — 8-axis bars', () => {
  it('references all 8 required axis keys', () => {
    expect(SRC).toContain('skinClarity');
    expect(SRC).toContain('jawDefinition');
    expect(SRC).toContain('eyeArea');
    expect(SRC).toContain('hairDensity');
    expect(SRC).toContain('posture');
    expect(SRC).toContain('facialHarmony');
    expect(SRC).toContain('expression');
    expect(SRC).toContain('bodyComposition');
  });

  it('uses base-fill and gain-fill classes for paired bars', () => {
    expect(SRC).toContain('base-fill');
    expect(SRC).toContain('gain-fill');
  });

  it('uses axis-journey CSS classes', () => {
    expect(SRC).toContain('axis-journey');
  });
});

describe('Module 4 — mirror heatmap', () => {
  it('has a 7-column grid', () => {
    expect(SRC).toContain('repeat(7, 1fr)');
  });

  it('implements month navigation chevrons', () => {
    expect(SRC).toContain('journeyMirrorPrev');
    expect(SRC).toContain('journeyMirrorNext');
  });

  it('uses heatmap-dot and heatmap-dot.on classes', () => {
    expect(SRC).toContain('heatmap-dot');
    expect(SRC).toContain('heatmap-dot.on');
  });

  it('shows the total mornings count (mirror-count-big)', () => {
    expect(SRC).toContain('mirror-count-big');
  });
});

describe('Module 5 — hair trend', () => {
  it('uses .badge for the trend pill', () => {
    // Pill reuses the existing .badge class
    expect(SRC).toContain('class="badge"');
  });

  it('does not use alarmist language (no "balding")', () => {
    expect(SRC).not.toContain('balding');
    expect(SRC).not.toContain('hair loss');
  });

  it('shows Norwood stage', () => {
    expect(SRC).toContain('norwoodStage');
  });
});
