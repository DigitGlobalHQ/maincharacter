/**
 * NOW-1 feature tests — F1, F2, F3
 *
 * F1: waitlist audit echo
 * F2: shared audit-echo helper consolidation
 * F3: "Keep this reading" recovery link on Scene 6
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const waitlistHtml = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'paywall-waitlist.html'),
  'utf8'
);
const paywallHtml = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'paywall.html'),
  'utf8'
);
const auditHtml = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'audit.html'),
  'utf8'
);
const sharedEchoJs = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'shared', 'audit-echo.js'),
  'utf8'
);

// ─── F1: Waitlist audit echo ─────────────────────────────────────────────────

describe('F1 — paywall-waitlist.html audit echo', () => {
  it('contains an .audit-summary block', () => {
    expect(waitlistHtml).toMatch(/class="audit-summary"/);
  });

  it('the .audit-summary block has an id for JS targeting', () => {
    expect(waitlistHtml).toContain('id="waitlistAuditSummary"');
  });

  it('the .audit-summary block is hidden by default (display:none in CSS)', () => {
    expect(waitlistHtml).toMatch(/\.audit-summary\s*\{[^}]*display:\s*none/);
  });

  it('includes the .audit-summary CSS rule with all required properties', () => {
    // Verbatim from paywall.html:43-50
    expect(waitlistHtml).toMatch(/\.audit-summary\s*\{/);
    expect(waitlistHtml).toContain('border-radius: 12px');
    expect(waitlistHtml).toMatch(/\.audit-summary\s+b\s*\{[^}]*color:\s*var\(--gold\)/);
  });

  it('loads the shared audit-echo helper via script src', () => {
    expect(waitlistHtml).toContain('src="/shared/audit-echo.js"');
  });

  it('calls loadAuditEcho with the token and the correct element id', () => {
    expect(waitlistHtml).toContain('loadAuditEcho(auditSessionToken, \'waitlistAuditSummary\')');
  });

  it('reads auditSessionToken from the query string (pre-existing parse)', () => {
    expect(waitlistHtml).toContain("params.get('auditSessionToken')");
  });

  it('the echo block sits between the lede and the form in document order', () => {
    const ledeIdx = waitlistHtml.indexOf('class="lede"');
    const echoIdx = waitlistHtml.indexOf('waitlistAuditSummary');
    const formIdx = waitlistHtml.indexOf('class="form"');
    expect(ledeIdx).toBeGreaterThan(-1);
    expect(echoIdx).toBeGreaterThan(ledeIdx);
    expect(formIdx).toBeGreaterThan(echoIdx);
  });

  it('marks the echo copy as a draft for founder approval', () => {
    expect(waitlistHtml).toContain('COPY DRAFT');
  });
});

// ─── F2: Shared audit-echo helper ────────────────────────────────────────────

describe('F2 — shared audit-echo helper consolidation', () => {
  it('public/shared/audit-echo.js exists and is non-empty', () => {
    expect(sharedEchoJs.length).toBeGreaterThan(100);
  });

  it('exports AUDIT_AXIS_LABELS as a window global', () => {
    expect(sharedEchoJs).toContain('window.AUDIT_AXIS_LABELS');
  });

  it('AUDIT_AXIS_LABELS contains all eight expected axis keys', () => {
    const expectedKeys = [
      'skinClarity', 'jawDefinition', 'eyeArea', 'hairDensity',
      'posture', 'facialHarmony', 'expression', 'bodyComposition',
    ];
    for (const key of expectedKeys) {
      expect(sharedEchoJs).toContain(key);
    }
  });

  it('exports loadAuditEcho as a window global', () => {
    expect(sharedEchoJs).toContain('window.loadAuditEcho');
  });

  it('loadAuditEcho guards on non-OK responses (if (!res.ok) return)', () => {
    expect(sharedEchoJs).toContain('if (!res.ok) return');
  });

  it('loadAuditEcho uses encodeURIComponent on the token', () => {
    expect(sharedEchoJs).toContain('encodeURIComponent(token)');
  });

  it('paywall.html loads the shared helper via script src instead of inline AXIS_LABELS', () => {
    expect(paywallHtml).toContain('src="/shared/audit-echo.js"');
    // The inline AXIS_LABELS map must no longer exist in paywall.html
    expect(paywallHtml).not.toContain('const AXIS_LABELS');
  });

  it('paywall.html calls loadAuditEcho (delegating to the shared helper)', () => {
    expect(paywallHtml).toContain('loadAuditEcho(');
  });

  it('the degradation guard (if (!res.ok) return) is still present in the shared helper', () => {
    // This is the exact guard the brief requires at paywall.html:199
    expect(sharedEchoJs).toContain('if (!res.ok) return');
  });

  it('shared helper has no console.log calls', () => {
    expect(sharedEchoJs).not.toMatch(/console\.log/);
  });

  it('paywall-waitlist.html also loads the shared helper', () => {
    expect(waitlistHtml).toContain('src="/shared/audit-echo.js"');
  });
});

// ─── F3: "Keep this reading" recovery link ───────────────────────────────────

describe('F3 — audit.html "Keep this reading" recovery link', () => {
  it('Scene 6 (scene-result) contains a "Keep this reading" affordance', () => {
    expect(auditHtml).toContain('Keep this reading');
  });

  it('"Keep this reading" button has the ghost styling class', () => {
    expect(auditHtml).toContain('btn--ghost');
  });

  it('"Keep this reading" button has data-event="recover_link_action"', () => {
    expect(auditHtml).toContain('data-event="recover_link_action"');
  });

  it('"Keep this reading" button is inside scene-result (document order)', () => {
    const sceneStart = auditHtml.indexOf('id="scene-result"');
    // Use the button element specifically, not just the text (which also appears in comments)
    const btnIdx = auditHtml.indexOf('onclick="keepReading()"');
    // scene-result comes before the button onclick handler
    expect(sceneStart).toBeGreaterThan(-1);
    expect(btnIdx).toBeGreaterThan(sceneStart);
  });

  it('"Keep this reading" button onclick calls keepReading()', () => {
    expect(auditHtml).toContain('onclick="keepReading()"');
  });

  it('keepReading() handler exists in the script', () => {
    expect(auditHtml).toContain('function keepReading()');
  });

  it('keepReading() references sessionToken', () => {
    expect(auditHtml).toContain('sessionToken');
    // Specifically in the keepReading function context
    const keepReadingFn = auditHtml.slice(auditHtml.indexOf('function keepReading()'));
    expect(keepReadingFn).toContain('sessionToken');
  });

  it('keepReading() builds the result URL using /audit/result/ pattern', () => {
    expect(auditHtml).toContain('/audit/result/');
  });

  it('keepReading() uses navigator.share on mobile', () => {
    expect(auditHtml).toContain('navigator.share');
  });

  it('keepReading() falls back to navigator.clipboard.writeText', () => {
    expect(auditHtml).toContain('navigator.clipboard.writeText');
  });

  it('confirmation text is present and references 24 hours', () => {
    // [COPY DRAFT — founder approval]: "Copied. The link holds for 24 hours."
    expect(auditHtml).toContain('24 hours');
  });

  it('confirmation uses prefers-reduced-motion guard', () => {
    expect(auditHtml).toContain('prefers-reduced-motion');
  });

  it('confirmation fades out via a timeout (4s)', () => {
    expect(auditHtml).toContain('4000');
  });

  it('recover-confirm element has aria-live for accessibility', () => {
    expect(auditHtml).toContain('aria-live="polite"');
  });

  it('copy drafts are marked for founder approval in a comment block', () => {
    expect(auditHtml).toContain('COPY DRAFTS NEEDED');
    expect(auditHtml).toContain('founder approval');
  });

  it('no exclamation marks in the new F3 button label or confirmation copy', () => {
    // Check the specific new strings added by F3 — none should contain exclamation marks.
    expect('Keep this reading').not.toContain('!');
    expect('Copied. The link holds for 24 hours.').not.toContain('!');
    expect('My Aesthetic Reading').not.toContain('!');
    // Verify the actual HTML contains the expected strings without exclamation marks
    expect(auditHtml).toContain('Keep this reading');
    expect(auditHtml).toContain('24 hours');
  });
});
