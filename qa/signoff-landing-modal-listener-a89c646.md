# QA Sign-off: landing.html coming-soon-modal listener fix
**Commit:** a89c646
**Date:** 2026-05-28
**Reviewer:** QA Agent

---

## Test results

### Vitest (unit + integration)
- **506 tests passed, 0 failed — 47 test files**
- `tests/landing.test.js` reports **22 tests passed**, up from 19 before the commit (the 3 new regression tests are confirmed counted in the total).
- No regressions to any previously passing test file observed.

### Smoke
- **31/31 checks passed**
- All critical routes clean: /, /audit, /paywall, /payment-confirmed, /lookmax/login, /lookmax/admin-login, /health, /api/lookmax/me, /api/audit/session, and all others.

---

## Diff review — correctness of the fix

**File:** `landing.html` lines 1515-1520

The original bug: `document.getElementById('coming-soon-modal').addEventListener(...)` ran bare inside the IIFE at script-parse time. The modal `<div id="coming-soon-modal">` is declared at line 1526, after the closing `</script>` at line 1523. The element did not yet exist in the DOM when the listener attach executed — result: TypeError at runtime, breaking backdrop-click dismissal.

The fix wraps the listener attach in `document.addEventListener('DOMContentLoaded', function() { ... })`. This defers execution until the full DOM is parsed, at which point the modal div is available. The fix is mechanically correct.

---

## Test quality review

The 3 regression tests in the new `describe` block correctly guard against future regressions:

1. **"modal div exists in the HTML"** — trivial existence check. Passes.
2. **"backdrop-click listener is deferred inside DOMContentLoaded, not bare in the IIFE"** — checks that (a) the `DOMContentLoaded` wrapper string is present, and (b) that the `getElementById('coming-soon-modal').addEventListener` string appears at a later character position in the file than the `DOMContentLoaded` open. This is an ordering check on raw text. It correctly fails if someone removes the wrapper and reverts to the bare pattern.
3. **"modal div is declared after the closing </script> tag in source order"** — guards the structural relationship that makes the DOMContentLoaded deferral necessary. If someone moves the modal div above the script block, this test flags it as a required review point.

Test 2 uses `indexOf` rather than AST analysis, which means a crafty refactor that puts the bare call before the DOMContentLoaded string in source order would defeat it. In practice this is not a realistic failure mode for this codebase (vanilla JS, no bundler reordering). Acceptable for the risk level.

---

## Brand-voice audit

Diff scope: `landing.html` lines 1515-1520 (the JS change) and the modal HTML at lines 1526-1545 (pre-existing, untouched).

- No copy strings were introduced or modified in the diff.
- Modal copy unchanged: "This pillar is being forged.", "The Consultant is preparing something precise.", "Join the waitlist — you'll be the first to know." — all pre-existing, brand-compliant.
- ◆ present at line 1529. No other emoji in the diff area.
- ✕ on line 1528 (close button) is U+2715, a punctuation glyph, not an emoji. Pre-existing.
- No prohibited words ("Great", "Amazing", "Awesome", "Crushing", "Let's go", "epic", "insane", "literally", "Got it", "Yay", "Boom") found in the diff.
- Exclamation marks at lines 1325, 1329, 1333 are inside the "What other apps say" contrast column — intentional negative examples, not MainCharacter voice. Untouched by this diff.

**Brand-voice verdict: CLEAN**

---

## Regression sweep — other getElementById ordering risks

All `document.getElementById(...)` calls in `landing.html`:

| Line | Element ID | Where declared |
|------|-----------|---------------|
| 1433 | `nav` | Line 1090, before the `<script>` at line 1428 — safe |
| 1489-1511 | `cs-pillar-name`, `cs-pillar-input`, `cs-pillar-data`, `cs-success`, `cs-form`, `coming-soon-modal` | Lines 1526-1545, after `</script>` at 1523 |
| 1517 | `coming-soon-modal` | Same — now correctly deferred via DOMContentLoaded |

The only calls referencing post-script elements are inside the `openComingSoon()` and `closeComingSoon()` and `submitWaitlist()` functions. Those are called only on user interaction (button clicks), which cannot fire until after DOM parsing completes. No ordering hazard there.

The `getElementById('nav')` at line 1433 is bare in the IIFE but the nav element is declared at line 1090, before the script block at line 1428. No hazard.

**No additional ordering issues found. No follow-up fix required.**

Flagging for backlog: if the script block is ever moved earlier in the document (e.g. to `<head>` with `defer`), the click-handler functions themselves (`openComingSoon`, `closeComingSoon`, `submitWaitlist`) would need `DOMContentLoaded` wrappers as well. Low probability of this happening; track as P3.

---

## Verdict

**SHIP**

- 506/506 Vitest tests pass (47 files)
- 31/31 smoke checks pass
- Fix is mechanically correct and addresses the stated bug
- Regression tests are present, meaningful, and would catch a revert
- Brand voice clean — no copy touched
- No new DOM ordering risks introduced
- No regressions to any existing flow (paywall, audit, mirror, admin login, payment-confirmed)
