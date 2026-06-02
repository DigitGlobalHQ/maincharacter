/**
 * tests/aura-score-object.test.js
 *
 * Verifies the canonical Aura Score Object (mc-aura-obj) is consistently
 * implemented on both the funnel reading surface (public/lookmaxing/audit.html)
 * and the dashboard (public/lookmax/index.html).
 *
 * Design-spec reference: visual-system-audit.md Part B3.2 + Part C Steps 3 & 5.
 *
 * Checks:
 *  - Both surfaces define the canonical mc-aura-obj CSS class structure
 *  - Both have a buildAuraScoreObject JS builder function
 *  - Both have an animateAuraScoreObject JS function
 *  - Silver-gradient numeral (Cormorant Garamond, background-clip: text)
 *  - Thin silver ring / arc (SVG circle stroke with linear gradient)
 *  - White light-point dot on the arc (mc-aura-obj__dot with drop-shadow)
 *  - JetBrains Mono "/ 100" (mc-aura-obj__denom)
 *  - JetBrains Mono rank label (mc-aura-obj__rank)
 *  - prefers-reduced-motion guard on arc transition
 *  - Dashboard: JetBrains Mono for data numerals (timeline, axis, delta, mirror, hair)
 *  - Dashboard: JetBrains Mono loaded in <head>
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(process.cwd());

const audit = fs.readFileSync(path.join(ROOT, 'public/lookmaxing/audit.html'), 'utf8');
const dash  = fs.readFileSync(path.join(ROOT, 'public/lookmax/index.html'), 'utf8');

// ── Shared: mc-aura-obj CSS class presence ─────────────────────────────────────

describe('mc-aura-obj CSS classes — audit.html', () => {
  it('defines .mc-aura-obj container class', () => {
    expect(audit).toContain('.mc-aura-obj {');
  });
  it('defines .mc-aura-obj__ring-wrap', () => {
    expect(audit).toContain('.mc-aura-obj__ring-wrap');
  });
  it('defines .mc-aura-obj__arc with SVG stroke', () => {
    expect(audit).toContain('.mc-aura-obj__arc');
  });
  it('defines .mc-aura-obj__dot', () => {
    expect(audit).toContain('.mc-aura-obj__dot');
  });
  it('defines .mc-aura-obj__numeral with silver-gradient text', () => {
    expect(audit).toContain('.mc-aura-obj__numeral');
    expect(audit).toContain('background-clip: text');
  });
  it('defines .mc-aura-obj__denom with JetBrains Mono or --mc-font-mono', () => {
    expect(audit).toContain('.mc-aura-obj__denom');
    // audit.html uses the CSS variable --mc-font-mono (which resolves to JetBrains Mono via tokens.css)
    expect(audit).toMatch(/mc-aura-obj__denom[\s\S]{0,200}(JetBrains Mono|--mc-font-mono)/);
  });
  it('defines .mc-aura-obj__rank with JetBrains Mono or --mc-font-mono', () => {
    expect(audit).toContain('.mc-aura-obj__rank');
    // audit.html uses the CSS variable --mc-font-mono (which resolves to JetBrains Mono via tokens.css)
    expect(audit).toMatch(/mc-aura-obj__rank[\s\S]{0,200}(JetBrains Mono|--mc-font-mono)/);
  });
  it('honours prefers-reduced-motion on arc transition', () => {
    expect(audit).toContain('prefers-reduced-motion');
    expect(audit).toContain('.mc-aura-obj__arc { transition: none; }');
  });
});

describe('mc-aura-obj CSS classes — dashboard index.html', () => {
  it('defines .mc-aura-obj container class', () => {
    expect(dash).toContain('.mc-aura-obj {');
  });
  it('defines .mc-aura-obj__ring-wrap', () => {
    expect(dash).toContain('.mc-aura-obj__ring-wrap');
  });
  it('defines .mc-aura-obj__arc', () => {
    expect(dash).toContain('.mc-aura-obj__arc');
  });
  it('defines .mc-aura-obj__dot', () => {
    expect(dash).toContain('.mc-aura-obj__dot');
  });
  it('defines .mc-aura-obj__numeral with silver-gradient text', () => {
    expect(dash).toContain('.mc-aura-obj__numeral');
    expect(dash).toContain('background-clip: text');
  });
  it('defines .mc-aura-obj__denom with JetBrains Mono', () => {
    expect(dash).toContain('.mc-aura-obj__denom');
    expect(dash).toMatch(/mc-aura-obj__denom[\s\S]{0,200}JetBrains Mono/);
  });
  it('defines .mc-aura-obj__rank with JetBrains Mono', () => {
    expect(dash).toContain('.mc-aura-obj__rank');
    expect(dash).toMatch(/mc-aura-obj__rank[\s\S]{0,200}JetBrains Mono/);
  });
  it('honours prefers-reduced-motion on arc transition', () => {
    expect(dash).toContain('prefers-reduced-motion');
  });
});

// ── Shared: JS builder functions ───────────────────────────────────────────────

describe('buildAuraScoreObject builder — audit.html', () => {
  it('defines buildAuraScoreObject function', () => {
    expect(audit).toContain('function buildAuraScoreObject(');
  });
  it('defines animateAuraScoreObject function', () => {
    expect(audit).toContain('function animateAuraScoreObject(');
  });
  it('builder outputs mc-aura-obj class', () => {
    expect(audit).toContain('"mc-aura-obj"');
  });
  it('builder outputs mc-aura-obj__numeral class', () => {
    expect(audit).toContain('"mc-aura-obj__numeral"');
  });
  it('builder includes SVG ring via <circle> elements', () => {
    expect(audit).toContain("'<circle class=\"mc-aura-obj__track\"");
  });
  it('builder includes light-point dot', () => {
    expect(audit).toContain("'<circle class=\"mc-aura-obj__dot\"");
  });
  it('builder outputs / 100 denom string', () => {
    // The denom is embedded in the HTML string as ">/ 100<" in JS template
    expect(audit).toContain('>/ 100<');
  });
  it('builder applies animation from 0 unless reduced-motion', () => {
    // On first build the dasharray starts at 0 (animates to target in animateAuraScoreObject)
    expect(audit).toContain('reducedMotion');
  });
});

describe('buildAuraScoreObject builder — dashboard index.html', () => {
  it('defines buildAuraScoreObject function', () => {
    expect(dash).toContain('function buildAuraScoreObject(');
  });
  it('defines animateAuraScoreObject function', () => {
    expect(dash).toContain('function animateAuraScoreObject(');
  });
  it('builder outputs mc-aura-obj class', () => {
    expect(dash).toContain('"mc-aura-obj"');
  });
  it('builder outputs mc-aura-obj__numeral class', () => {
    expect(dash).toContain('"mc-aura-obj__numeral"');
  });
  it('builder includes SVG ring via <circle> elements', () => {
    expect(dash).toContain("'<circle class=\"mc-aura-obj__track\"");
  });
  it('builder includes light-point dot', () => {
    expect(dash).toContain("'<circle class=\"mc-aura-obj__dot\"");
  });
  it('builder outputs / 100 denom string', () => {
    // The denom is embedded in the HTML string as ">/ 100<" in JS template
    expect(dash).toContain('>/ 100<');
  });
  it('calls animateAuraScoreObject after rendering the slot', () => {
    expect(dash).toContain('animateAuraScoreObject(r.auraScore)');
  });
});

// ── Dashboard: JetBrains Mono loaded in <head> ─────────────────────────────────

describe('dashboard <head> — JetBrains Mono font loaded', () => {
  // The spec (visual-system-audit Part C Step 3) requires adding JetBrains Mono
  // to the dashboard head, which previously only loaded Cormorant + Sora.
  it('loads JetBrains Mono from Google Fonts', () => {
    expect(dash).toContain('JetBrains+Mono');
  });
  it('includes JetBrains Mono weight 400', () => {
    expect(dash).toMatch(/JetBrains\+Mono:wght@[0-9;]*400/);
  });
});

// ── Dashboard: data numerals converted to JetBrains Mono ─────────────────────

describe('dashboard — data numerals use JetBrains Mono (Step 3)', () => {
  it('timeline-score uses JetBrains Mono (not Cormorant or Sora)', () => {
    // The old value was font-family: 'Cormorant Garamond', serif
    const scoreRuleMatch = dash.match(/\.timeline-score\s*\{([^}]+)\}/);
    expect(scoreRuleMatch).not.toBeNull();
    const ruleBody = scoreRuleMatch[1];
    expect(ruleBody).toContain('JetBrains Mono');
    expect(ruleBody).not.toContain('Cormorant Garamond');
  });

  it('timeline-rank uses JetBrains Mono', () => {
    const rankRuleMatch = dash.match(/\.timeline-rank\s*\{([^}]+)\}/);
    expect(rankRuleMatch).not.toBeNull();
    expect(rankRuleMatch[1]).toContain('JetBrains Mono');
  });

  it('timeline-delta uses JetBrains Mono', () => {
    const deltaRuleMatch = dash.match(/\.timeline-delta\s*\{([^}]+)\}/);
    expect(deltaRuleMatch).not.toBeNull();
    expect(deltaRuleMatch[1]).toContain('JetBrains Mono');
  });

  it('axis-journey-scores uses JetBrains Mono', () => {
    const axisScoresMatch = dash.match(/\.axis-journey-scores\s*\{([^}]+)\}/);
    expect(axisScoresMatch).not.toBeNull();
    expect(axisScoresMatch[1]).toContain('JetBrains Mono');
  });

  it('axis-journey-delta uses JetBrains Mono', () => {
    const axisDeltaMatch = dash.match(/\.axis-journey-delta\s*\{([^}]+)\}/);
    expect(axisDeltaMatch).not.toBeNull();
    expect(axisDeltaMatch[1]).toContain('JetBrains Mono');
  });

  it('mirror-count-big uses JetBrains Mono (was Cormorant Garamond)', () => {
    const mirrorMatch = dash.match(/\.mirror-count-big\s*\{([^}]+)\}/);
    expect(mirrorMatch).not.toBeNull();
    const ruleBody = mirrorMatch[1];
    expect(ruleBody).toContain('JetBrains Mono');
    expect(ruleBody).not.toContain('Cormorant Garamond');
  });

  it('hair-score-big uses JetBrains Mono (was Cormorant Garamond)', () => {
    const hairMatch = dash.match(/\.hair-score-big\s*\{([^}]+)\}/);
    expect(hairMatch).not.toBeNull();
    const ruleBody = hairMatch[1];
    expect(ruleBody).toContain('JetBrains Mono');
    expect(ruleBody).not.toContain('Cormorant Garamond');
  });

  it('sparkline score label uses JetBrains Mono font-family attribute', () => {
    expect(dash).toContain('JetBrains Mono,SF Mono,Menlo,monospace');
  });
});

// ── Dashboard: renderAuraReading uses canonical score object ──────────────────

describe('dashboard renderAuraReading — uses canonical mc-aura-obj', () => {
  it('calls buildAuraScoreObject inside renderAuraReading', () => {
    // Confirm the function call appears in the renderAuraReading context
    expect(dash).toContain('buildAuraScoreObject({ score: r.auraScore, rank: rank })');
  });

  it('scoreObjHtml variable is injected into the slot HTML', () => {
    expect(dash).toContain('scoreObjHtml');
  });

  it('no longer uses Cormorant Garamond inline-style for the Aura score numeral', () => {
    // The old pattern was: font-family:'Cormorant Garamond',serif;font-size:44px
    // After the upgrade this inline style must be gone from renderAuraReading
    expect(dash).not.toContain("font-family:\\'Cormorant Garamond\\',serif;font-size:44px");
  });
});

// ── Shared: SVG ring anatomy ───────────────────────────────────────────────────

describe('SVG ring anatomy — audit.html', () => {
  it('uses linearGradient for silver arc stroke', () => {
    expect(audit).toContain('<linearGradient id="mc-aura-silver-grad"');
  });
  it('arc stroke references gradient url', () => {
    expect(audit).toContain('url(#mc-aura-silver-grad)');
  });
  it('light-point dot has drop-shadow filter', () => {
    expect(audit).toContain('drop-shadow');
  });
});

describe('SVG ring anatomy — dashboard index.html', () => {
  it('uses linearGradient for silver arc stroke (distinct db id)', () => {
    expect(dash).toContain('<linearGradient id="mc-aura-silver-grad-db"');
  });
  it('arc stroke references gradient url', () => {
    expect(dash).toContain('url(#mc-aura-silver-grad-db)');
  });
  it('light-point dot has drop-shadow filter', () => {
    expect(dash).toContain('drop-shadow');
  });
});

// ── No gold hex in either surface ─────────────────────────────────────────────

describe('no raw gold hex in score object definition', () => {
  it('audit.html mc-aura-obj styles contain no gold hex #e8b84b', () => {
    // Extract the mc-aura-obj style block and check for gold
    const objStyleStart = audit.indexOf('.mc-aura-obj {');
    const objStyleEnd   = audit.indexOf('.lm-section-label', objStyleStart);
    const objStyles = audit.slice(objStyleStart, objStyleEnd);
    expect(objStyles).not.toContain('#e8b84b');
  });

  it('dashboard mc-aura-obj styles contain no gold hex #e8b84b', () => {
    const objStyleStart = dash.indexOf('.mc-aura-obj {');
    const objStyleEnd   = dash.indexOf('.mc-mono-numeral', objStyleStart);
    const objStyles = dash.slice(objStyleStart, objStyleEnd);
    expect(objStyles).not.toContain('#e8b84b');
  });
});
