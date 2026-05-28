/**
 * NOW-3 Dashboard UI tests.
 * These are source-scan tests (read the HTML/JS source as text) since the
 * dashboard renders client-side.  They verify structure guarantees that would
 * otherwise only surface at runtime.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const dashboardSrc = fs.readFileSync(
  path.resolve(__dirname, '../public/lookmax/index.html'),
  'utf8'
);
const mirrorSrc = fs.readFileSync(
  path.resolve(__dirname, '../public/lookmax/mirror.html'),
  'utf8'
);
const protocolSrc = fs.readFileSync(
  path.resolve(__dirname, '../public/lookmax/protocol.html'),
  'utf8'
);

// ─── fire emoji purge ────────────────────────────────────────────────────────

describe('fire-emoji purge', () => {
  it('index.html contains no 🔥 literal', () => {
    expect(dashboardSrc).not.toContain('🔥');
    expect(dashboardSrc).not.toContain('🔥');
  });

  it('mirror.html contains no 🔥 literal', () => {
    expect(mirrorSrc).not.toContain('🔥');
    expect(mirrorSrc).not.toContain('🔥');
  });

  it('protocol.html contains no 🔥 literal', () => {
    expect(protocolSrc).not.toContain('🔥');
    expect(protocolSrc).not.toContain('🔥');
  });
});

// ─── streak format uses approved "Day N" pattern ─────────────────────────────

describe('streak badge — approved Day N format', () => {
  it('index.html streak badge uses "Day " prefix, not fire emoji', () => {
    // The JS that sets the badge text must use the Day-N pattern
    expect(dashboardSrc).toContain("'Day '");
    // Must not concatenate fire emoji
    expect(dashboardSrc).not.toContain("+ ' 🔥'");
    expect(dashboardSrc).not.toContain('+ " 🔥"');
  });

  it('mirror.html streak badge uses "Day " prefix', () => {
    expect(mirrorSrc).toContain("'Day '");
    expect(mirrorSrc).not.toContain("+ ' 🔥'");
  });

  it('protocol.html streak badge uses "Day " prefix', () => {
    expect(protocolSrc).toContain("'Day '");
    expect(protocolSrc).not.toContain("+ ' 🔥'");
  });
});

// ─── Mirror tile is promoted to primary card ─────────────────────────────────

describe('dashboard Mirror tile promotion', () => {
  it('contains card--mirror-primary class', () => {
    expect(dashboardSrc).toContain('card--mirror-primary');
  });

  it('Mirror tile renders before Protocol and Hair tiles in DOM order', () => {
    const mirrorPos = dashboardSrc.indexOf('card--mirror-primary');
    const tileRowPos = dashboardSrc.indexOf('tile-row');
    expect(mirrorPos).toBeGreaterThan(-1);
    expect(tileRowPos).toBeGreaterThan(-1);
    // The primary mirror card markup must come before the secondary tile-row
    expect(mirrorPos).toBeLessThan(tileRowPos);
  });

  it('tile-row grid holds Protocol and Hair as secondary tiles', () => {
    expect(dashboardSrc).toContain('tile-row');
  });
});

// ─── cross-sell slot ─────────────────────────────────────────────────────────

describe('cross-sell slot', () => {
  it('has a #cross-sell-slot element', () => {
    expect(dashboardSrc).toContain('id="cross-sell-slot"');
  });

  it('cross-sell card uses approved body copy', () => {
    expect(dashboardSrc).toContain('The face is moving. The voice is the next mirror.');
  });

  it('cross-sell card has Add The Orator CTA', () => {
    expect(dashboardSrc).toContain('Add The Orator');
  });

  it('cross-sell card routes to /paywall?intent=bundle', () => {
    expect(dashboardSrc).toContain('/paywall?intent=bundle');
  });

  it('cross-sell card only renders when crossSellEligible is true', () => {
    // The JS guard must reference crossSellEligible
    expect(dashboardSrc).toContain('crossSellEligible');
  });

  it('cross-sell respects localStorage silence flag', () => {
    expect(dashboardSrc).toContain('cross_sell_orator_dismissed');
  });

  it('cross-sell has a dismiss button with a data-event attribute', () => {
    expect(dashboardSrc).toContain('cross_sell_orator_dismissed');
  });

  it('cross-sell card has KPI data-event attributes', () => {
    expect(dashboardSrc).toContain('cross_sell_orator_clicked');
  });
});

// ─── always-on wallpaper banner is gone ──────────────────────────────────────

describe('always-on cross-sell banner removed', () => {
  it('no longer has the unconditional oratorActive block from the old banner', () => {
    // The old pattern rendered the banner whenever !d.user.oratorActive — unconditional
    // The new pattern requires crossSellEligible. The old href must be gone.
    expect(dashboardSrc).not.toContain('upgrade=auraplus&from=lookmax');
  });
});

// ─── KPI data-event hooks ────────────────────────────────────────────────────

describe('KPI data-event hooks on dashboard tiles', () => {
  it('mirror tile has data-event="mirror_tile_clicked"', () => {
    expect(dashboardSrc).toContain('mirror_tile_clicked');
  });

  it('protocol tile has data-event reference', () => {
    expect(dashboardSrc).toContain('protocol_tile_clicked');
  });

  it('hair tile has data-event reference', () => {
    expect(dashboardSrc).toContain('hair_tile_clicked');
  });
});
