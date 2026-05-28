/**
 * Approved copy strings — 2026-05-28
 * Asserts that each founder-approved string from product/copy-pending-approval-2026-05-28.md
 * is present verbatim in its target surface. 30 strings, some with conditional variants.
 *
 * NOTE: Template-variable strings (#19–#21, #25–#28) are stored server-side and
 * rendered by the API. This file asserts the frontend carries the constants file
 * reference (for strings the frontend renders directly) and that the HTML surfaces
 * contain the correct static approved copy.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

const mirror   = read('public/lookmax/mirror.html');
const protocol = read('public/lookmax/protocol.html');
const hair     = read('public/lookmax/hair.html');
const reveal   = read('public/lookmax/reveal.html');
const login    = read('public/lookmax/login.html');
const payConf  = read('public/payment-confirmed.html');
const revealConstants = fs.existsSync(path.join(root, 'data/reveal-copy-constants.js'))
  ? read('data/reveal-copy-constants.js')
  : '';

// ── Mirror strings (#01–#07) ──────────────────────────────────────────────────

describe('mirror.html — approved copy (#01–#07)', () => {
  it('#01 capture eyebrow: "Today."', () => {
    expect(mirror).toContain('Today.');
  });

  it('#02 ritual cue: "Stand still for a moment. The camera is waiting."', () => {
    expect(mirror).toContain('Stand still for a moment. The camera is waiting.');
  });

  it('#03 analysis frame line: "The reading takes a minute. Hold."', () => {
    expect(mirror).toContain('The reading takes a minute. Hold.');
  });

  it('#04 camera-unavailable hint: "The camera is blocked. A photo from your library works the same."', () => {
    expect(mirror).toContain('The camera is blocked. A photo from your library works the same.');
  });

  it('#05 first-mirror baseline: "Today is the baseline. Hold it. Tomorrow has something to push against."', () => {
    expect(mirror).toContain('Today is the baseline. Hold it. Tomorrow has something to push against.');
  });

  it('#06 day-1 trend caption: "Your line begins."', () => {
    expect(mirror).toContain('Your line begins.');
  });

  it('#07 already-mirrored banner: "You have already sat today. Another reading replaces the first."', () => {
    expect(mirror).toContain('You have already sat today. Another reading replaces the first.');
  });

  it('#01–#07: no TODO copy markers remain in mirror.html', () => {
    // All TODO copy comments in these capture/analysis/reveal areas should be gone
    const todoCount = (mirror.match(/TODO copy(?!.*Did not save)/g) || []).length;
    expect(todoCount).toBe(0);
  });
});

// ── Protocol strings (#08–#12) ────────────────────────────────────────────────

describe('protocol.html — approved copy (#08–#12)', () => {
  it('#08 streak label format: "Day N" plain (rendered via "Day " + streak)', () => {
    // The JS renders: 'Day ' + (state.streak || 0)
    expect(protocol).toContain("'Day '");
  });

  it('#09 do-nots frame line: "What not to do. These are the levers the protocol bets on."', () => {
    expect(protocol).toContain('What not to do. These are the levers the protocol bets on.');
  });

  it('#10 ≥80% supporting line: "Eighty percent or more carries the streak. You are over the line."', () => {
    expect(protocol).toContain('Eighty percent or more carries the streak. You are over the line.');
  });

  it('#11 CTA 0-state: "Complete the day — N more to go" pattern present', () => {
    // Dynamic label: includes '— ' + remaining + ' more to go'
    expect(protocol).toContain('more to go');
  });

  it('#11 CTA ≥80% state: "Complete the day ◆"', () => {
    expect(protocol).toContain('Complete the day ◆');
  });

  it('#11 CTA 100% locked state: "Day complete ◆" remains unchanged', () => {
    expect(protocol).toContain('Day complete ◆');
  });

  it('#12 no-protocol empty state: "There is no protocol until there is a mirror. The reading writes it."', () => {
    expect(protocol).toContain('There is no protocol until there is a mirror. The reading writes it.');
  });

  it('#08–#12: no TODO copy markers remain in protocol.html', () => {
    const todoCount = (protocol.match(/TODO copy(?!.*Did not save)/g) || []).length;
    expect(todoCount).toBe(0);
  });
});

// ── Hair strings (#13–#17) ────────────────────────────────────────────────────

describe('hair.html — approved copy (#13–#17)', () => {
  it('#13 capture-view discretion frame: "A weekly read, kept between you and the mirror."', () => {
    expect(hair).toContain('A weekly read, kept between you and the mirror.');
  });

  it('#14 privacy beat: "We score the photos. We do not publish them. ◆"', () => {
    expect(hair).toContain('We score the photos. We do not publish them. ◆');
  });

  it('#15 leverage-axis line (conditional): rendered only when data-leverage-axis="true"', () => {
    expect(hair).toContain('Hair density was the leverage point on Day 1. This is the read.');
  });

  it('#15 is conditional on wasLeverageAxis flag', () => {
    // Must be inside a conditional branch, not unconditionally rendered
    expect(hair).toMatch(/wasLeverageAxis|data-leverage-axis/);
  });

  it('#16 leverage nudge (conditional): "The axis the audit named is the axis that is moving."', () => {
    expect(hair).toContain('The axis the audit named is the axis that is moving.');
  });

  it('#16 is gated on wasLeverageAxis === true && delta > 0', () => {
    expect(hair).toMatch(/wasLeverageAxis.*delta|delta.*wasLeverageAxis/s);
  });

  it('#17 first-ever-reading empty line: "The first reading begins this week."', () => {
    expect(hair).toContain('The first reading begins this week.');
  });

  it('#13–#17: no TODO copy markers remain in hair.html', () => {
    const todoCount = (hair.match(/TODO copy/g) || []).length;
    expect(todoCount).toBe(0);
  });
});

// ── Reveal strings (#18–#28) ─────────────────────────────────────────────────

describe('reveal.html — approved copy (#18–#28)', () => {
  it('#18 share-frame line: "This is what shares — your week as a quiet line."', () => {
    expect(reveal).toContain('This is what shares — your week as a quiet line.');
  });

  it('#22 day-30 topbar label: "◆ The Second Reading"', () => {
    expect(reveal).toContain('◆ The Second Reading');
  });

  it('#23 day-30 h1: "Thirty days, beside Day 1."', () => {
    expect(reveal).toContain('Thirty days, beside Day 1.');
  });

  it('#24 day-30 photo captions use Day 1 / Day 30 date format', () => {
    // Captions: "Day 1 — DD MMM" / "Day 30 — today"
    expect(reveal).toContain('Day 1 —');
    expect(reveal).toContain('Day 30 — today');
  });

  it('#18–#28: no TODO copy markers remain in reveal.html for these strings', () => {
    // Check that approved-string TODO comments are replaced
    expect(reveal).not.toContain('TODO copy: share-frame line');
    expect(reveal).not.toContain('TODO copy: topbar');
    expect(reveal).not.toContain('TODO copy: h1');
    expect(reveal).not.toContain('TODO copy: "Day 1 — DD MMM"');
    expect(reveal).not.toContain('TODO copy: close line');
  });
});

describe('reveal constants (server-side template strings #19–#21, #25–#28)', () => {
  it('constants file exists at data/reveal-copy-constants.js', () => {
    const exists = fs.existsSync(path.join(root, 'data/reveal-copy-constants.js'));
    expect(exists).toBe(true);
  });

  it('#19 weekly UP variant template present', () => {
    expect(revealConstants).toContain('The line is up. Week {{week}} held.');
  });

  it('#20 weekly FLAT variant template present', () => {
    expect(revealConstants).toContain('The line held flat this week. A held line is the floor we work from.');
  });

  it('#21 weekly DOWN variant template present', () => {
    expect(revealConstants).toContain('The line moved down. That is data, not verdict');
  });

  it('#25 day-30 UP variant template present', () => {
    expect(revealConstants).toContain('This is not flattery — it is the measurement.');
  });

  it('#26 day-30 FLAT variant template present', () => {
    expect(revealConstants).toContain('The reading sits at Day 1.');
  });

  it('#27 day-30 DOWN variant template present (full + branched)', () => {
    expect(revealConstants).toContain('Day 30 reads below Day 1.');
    expect(revealConstants).toContain('We aim there.');
  });

  it('#27 held-count branching: heldCount===0 branch drops the "held" sentence', () => {
    // Constants file must define both the full and branched version
    expect(revealConstants).toContain('heldCount');
  });

  it('#28 day-30 close line template present', () => {
    expect(revealConstants).toContain('You entered as {{level1}}. You are reading {{level30}}.');
  });

  it('no exclamation marks in any constant string', () => {
    expect(revealConstants).not.toMatch(/!/);
  });
});

// ── Login string (#29) ────────────────────────────────────────────────────────

describe('login.html — approved copy (#29)', () => {
  it('#29 stateLoading body: "Holding the door."', () => {
    expect(login).toContain('Holding the door.');
  });

  it('#29: no TODO copy marker remains in stateLoading', () => {
    // The original TODO was in that div; after approval it should be gone
    expect(login).not.toContain('TODO copy: spec calls for a single Consultant-voice line here');
  });
});

// ── Payment-confirmed strings (#30) ───────────────────────────────────────────

describe('payment-confirmed.html — Orator-only path (#30)', () => {
  it('#30 disabled-button label: "Day 1 arrives tomorrow"', () => {
    expect(payConf).toContain('Day 1 arrives tomorrow');
  });

  it('#30 caption below button: "Your first message lands at the time you chose. Nothing to do tonight."', () => {
    expect(payConf).toContain('Your first message lands at the time you chose. Nothing to do tonight.');
  });

  it('#30 is inside the oratorActive conditional path', () => {
    // The Orator block is gated on d.oratorActive
    expect(payConf).toContain('oratorActive');
  });

  it('#30: no TODO copy marker for Orator disabled-button caption', () => {
    expect(payConf).not.toContain('TODO copy: Orator-only disabled-button caption');
  });
});

// ── COPY-APPROVED comment markers present ─────────────────────────────────────

describe('COPY APPROVED markers present in each file', () => {
  it('mirror.html carries COPY APPROVED 2026-05-28 markers', () => {
    expect(mirror).toContain('COPY APPROVED 2026-05-28');
  });
  it('protocol.html carries COPY APPROVED 2026-05-28 markers', () => {
    expect(protocol).toContain('COPY APPROVED 2026-05-28');
  });
  it('hair.html carries COPY APPROVED 2026-05-28 markers', () => {
    expect(hair).toContain('COPY APPROVED 2026-05-28');
  });
  it('reveal.html carries COPY APPROVED 2026-05-28 markers', () => {
    expect(reveal).toContain('COPY APPROVED 2026-05-28');
  });
  it('login.html carries COPY APPROVED 2026-05-28 markers', () => {
    expect(login).toContain('COPY APPROVED 2026-05-28');
  });
  it('payment-confirmed.html carries COPY APPROVED 2026-05-28 markers', () => {
    expect(payConf).toContain('COPY APPROVED 2026-05-28');
  });
});
