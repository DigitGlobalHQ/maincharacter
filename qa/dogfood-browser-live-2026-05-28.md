# Browser Dogfood — Live Site — 2026-05-28

**Target:** https://maincharacter.digitglobalservices.com
**Live commit at sweep start:** `73d4d3b` (per `/health`)
**Browser:** Chrome (claude-in-chrome MCP), desktop 1440×900 + mobile 360px (rendered 454px due to chrome chrome)
**Tester:** Claude orchestrator
**Mode:** Authorised pre-launch dogfood — no payments triggered, no magic-links sent

---

## Surface verdicts (Phase 1)

| # | Surface | Verdict | Notes |
|---|---|---|---|
| 1 | `/` (landing) | **FAIL** — 1 P1 JS error + 1 P1 footer links | Renders, brand intact, primary CTAs functional via onclick |
| 2 | `/audit` (6-scene funnel) | **PASS** | Walked 10 sub-scenes (Skin ×3, Hair ×2, Jaw ×2, Body ×2, Lifestyle ×2, Goals ×1) → stopped at THE READING photo upload as instructed |
| 3 | `/paywall` | **PASS** with 1 P2 | 3 cards render, Aura++ "MOST CHOSEN" badge, in-voice blank-email error confirmed |
| 4 | `/lookmax/` fresh | **PASS** | Bounces to `/lookmax/login` |
| 5 | `/lookmax/login` | **PASS** | Request state default, all 3 user states clean, admin fallback hidden |
| 6 | Brand voice sweep | **PASS** | Zero violations; "WHAT OTHER APPS SAY" block is intentional contrast |
| 7 | Mobile 360px (eff. 454px) | **PASS** | Cards stack vertically, no horizontal overflow detected |
| 8 | Console errors | **FAIL** — 1 recurring exception | Landing `/` only; other pages clean |

---

## Findings — by severity

### P0 — Block launch
*(none)*

### P1 — Fix before launch

#### P1-1 — Landing JS exception (script before DOM)
- **Where:** `landing.html` line 1516
- **Symptom:** `TypeError: Cannot read properties of null (reading 'addEventListener')` fires on every load of `/`
- **Root cause:** IIFE at line 1500 calls `document.getElementById('coming-soon-modal').addEventListener(...)` but `#coming-soon-modal` div is defined LATER at line 1524
- **Impact:** (a) Console pollution on every landing load; (b) Coming-soon modal close-on-backdrop won't work if modal is ever opened — user would be trapped
- **Fix scope:** Move the listener wiring after the modal HTML, OR wrap in `DOMContentLoaded`, OR change selector to a deferred lookup
- **Route to:** `frontend-agent`

#### P1-2 — Footer Privacy / Terms / Contact are all `/#`
- **Where:** Landing `/` footer; same dead anchors at all three links
- **Symptom:** Privacy/Terms/Contact links resolve to `/#` (placeholder)
- **Impact:** Razorpay KYC requires linkable Privacy Policy and Terms of Service before processing live payments; "Contact" with no destination is a customer-trust red flag
- **Fix scope:** Either (a) ship the three pages, or (b) hide the links from the footer until pages exist
- **Route to:** `legal-finance-agent` (draft Privacy/Terms) → `copy-consultant-agent` (review voice) → `frontend-agent` (wire) — OR `frontend-agent` (hide links short-term)
- **Founder decision needed:** Ship real pages now, or hide links and ship after KYC paperwork lands?

### P2 — Fix this week

#### P2-1 — Nav "BEGIN YOUR ARC →" button clipped at viewport right edge (desktop 1440)
- **Where:** Landing `/` top navigation, viewport 1440px
- **Symptom:** Button extends past viewport right edge — visible as "BEGIN YOUR AR" with the closing "C →" hidden
- **Impact:** Cosmetic; still clickable, but reads broken
- **Fix scope:** Add `padding-right` to nav container, or constrain button max-width, or hide button below a breakpoint
- **Route to:** `frontend-agent`

#### P2-2 — Aura++ paywall card clipped at viewport right edge (desktop 1440)
- **Where:** `/paywall`, 3-card row at desktop width
- **Symptom:** Aura++ card right edge runs off viewport; "Daily WhatsApp Protocol + Da[ily]" and similar bullets are cut mid-word
- **Impact:** Highest-revenue plan card looks broken; weakens the "MOST CHOSEN" anchor
- **Fix scope:** Reduce card max-width, increase card gap collapse breakpoint, or constrain `.cards` container max-width
- **Route to:** `frontend-agent`

### P3 — Backlog only

#### P3-1 — Quest pcards on landing are `<div onclick="window.location.href=...">`, not `<a>`
- **Symptom:** Two main pillar CTAs ("Accept the Quest" / "Get Your Aura Reading") are clickable divs
- **Impact:** Not keyboard-navigable, no semantic href for SEO/screen readers, no right-click "open in new tab"
- **Fix scope:** Convert to `<a href="/start">` and `<a href="/audit">`
- **Route to:** `BACKLOG.md`

#### P3-2 — Paywall validation hint doesn't update reactively while typing
- **Symptom:** "Your name, first." stays visible after the name field has content; clears only on next plan-click or submit
- **Impact:** Cosmetic; users may double-tap
- **Route to:** `BACKLOG.md`

#### P3-3 — Paywall: bottom hint "Choose a path above to begin." persists alongside selection
- **Symptom:** Even after a Begin button is clicked and the plan is selected, the muted "Choose a path above to begin." hint is still shown
- **Impact:** Mildly confusing; suggests no selection when one is active
- **Route to:** `BACKLOG.md`

---

## Brand-voice sweep — RESULT: CLEAN

No violations found. Specifically:
- **Emojis:** Only ◆ (diamond) used anywhere in user-facing surfaces
- **Exclamations:** Only inside the deliberate "WHAT OTHER APPS SAY" contrast block on landing (paired with quotes attributed to other apps — by design)
- **Hype words:** Zero. No "great", "amazing", "awesome", "crushing", "let's go", "epic", "insane", "literally" anywhere in MainCharacter's own voice
- **Cadence:** Short. Then longer. Then short. Held throughout.
- **Signature mark:** `◆ MainCharacter` present at footers of landing, paywall, and `/lookmax/login`

Notable in-voice strings observed and approved (no copy changes needed):
- `Five minutes. One reading. Yours.` (`/audit` hero)
- `We need the truth, not the angle.` (`/audit` THE READING)
- `The diagnosis was free. The discipline is the offer.` (`/paywall`)
- `Email is required for Lookmaxxing — you enter the work through it.` (`/paywall` validation)
- `Enter the room.` (`/lookmax/login` hero)
- `A single-use link arrives within a minute, valid for fifteen.` (`/lookmax/login`)
- `This link is no longer valid. Request a new one below.` (`/lookmax/login` consume-error)

---

## Console state per surface

| Surface | Errors | Warnings |
|---|---|---|
| `/` | **1 recurring** (P1-1 above) | 0 |
| `/audit` | 0 (clean) | 0 |
| `/paywall` | 0 (clean) | 0 |
| `/lookmax/login` | 0 (clean) | 0 |

---

## Test paths explicitly NOT exercised (per founder instruction)

- **Razorpay handoff** — stopped at paywall pre-checkout; blocked on founder enabling Razorpay recurring payments
- **Photo uploads** to `/audit` THE READING scene
- **Actual magic-link request** at `/lookmax/login` — visually previewed the inbox + error states by manipulating DOM classes via JS rather than triggering a real send

---

## Out-of-scope observations (for `BACKLOG.md`, not Phase 2)

- `/health` reports `database: false` — JSON-file DB is the known landmine; mandatory migration before any real signup
- `/health` reports `lookmaxxing.configured: true`, `messaging.configured: false` (Meta Cloud creds not yet set) — matches CLAUDE.md landmine #5 (DRY-RUN expected)
- `/health` reports `webhookGuard: open` — until `WHATSAPP_APP_SECRET` is set, the Meta webhook accepts unsigned requests. Documented landmine #5.
- Aura++ "MOST CHOSEN" badge is good positioning anchor — keep
- Audit funnel reading scene says "Stand in natural light. Camera at eye level." — strong instruction, in-voice

---

## Next phase

P0/P1 routing for Phase 2:
- P1-1 → `frontend-agent` (small, isolated, no copy change)
- P1-2 → **founder decision blocker** (Privacy/Terms drafts vs hide-and-defer)

---

## Phase 2 — fix outcomes

### P1-1 — RESOLVED + BROWSER-CONFIRMED on live

| Step | Result |
|---|---|
| Routed to | `frontend-agent` |
| First commit | `a89c646` — wrapped listener in `DOMContentLoaded` + 3 regression tests in `tests/landing.test.js` |
| **Regression introduced** | First fix added a comment containing literal `</script>` — HTML parser truncated the script block → new `SyntaxError: Unexpected end of input` on every load. Caught by browser re-test on live. |
| Routed again to | `frontend-agent` |
| Second commit | `0e90eaf` — rewrote the comment to remove `</script>` substring + added a guard test that fails if any script body contains a literal `</script>` substring |
| QA sign-off | `qa/signoff-landing-modal-listener-a89c646.md` — SHIP verdict (note: signed off on a89c646 only; 0e90eaf is the live commit and was browser-confirmed by orchestrator) |
| Tests | 506/507 passing; 1 pre-existing `api.test.js` enroll-timeout against DRY-RUN WhatsApp send, not introduced by either commit |
| Smoke | 31/31 passing |
| **Browser re-confirmation on live (commit `0e90eaf`)** | Console: 0 messages on fresh load. Modal open/close-on-backdrop verified working via `dispatchEvent` (close-on-backdrop never wired before this fix — now actually works). |
| Status | **CLOSED** |

### P1-2 — DRAFTS PENDING FOUNDER APPROVAL (cannot ship)

| Step | Result |
|---|---|
| Routed to | `legal-finance-agent` |
| Drafts delivered | `product/draft-privacy-policy.md` (7 Founder decisions), `product/draft-terms-of-service.md` (6 Founder decisions), `product/draft-contact-page.md` (2 Founder decisions) |
| **Hard blocker surfaced** | Postal address is missing from project context. Razorpay live KYC requires it + Consumer Protection (E-Commerce) Rules 2020 Rule 5 requires it. All three pages have address-shaped holes until founder supplies one. |
| Soft blocker surfaced | GST registration timing — services threshold ₹20L crossed at ~2,500 customer-months/yr. Recommendation: register before crossing rather than back-collect. |
| Follow-up logged | `BACKLOG.md` — `frontend-agent` ticket to ship the three pages + repair `/#` footer links, gated on founder approval |
| QA sign-off | Deferred until founder approves the drafts; lawyer review also recommended (~₹15K–40K solo, ~₹80K–1.5L Tier-1) |
| Status | **HELD pending founder action** |

---

## Phase 3 — full re-sweep (live, commit `0e90eaf`)

| # | Surface | Verdict | Notes |
|---|---|---|---|
| 1 | `/` (landing) | **PASS** | Console clean, brand intact, CTA functional |
| 2 | `/audit` | **PASS** | Renders cleanly, Scene 1 hero ("The room reads you before you speak.") |
| 3 | `/paywall` | **PASS** | 3 cards render, Aura++ "MOST CHOSEN" badge, all bullets fully visible at effective 1309px |
| 4 | `/lookmax/` → `/lookmax/login` | **PASS** | Redirect works, request state default, admin hidden |
| 5 | Console errors | **CLEAN** across all 4 surfaces |
| 6 | Brand voice | **CLEAN** — no new violations introduced |

P2-1 and P2-2 (nav button / Aura++ card right-edge clipping) did not reproduce at the effective viewport on re-sweep (~1309px after browser chrome). They reproduce only at the precise 1440px viewport tested in Phase 1. Logged to `BACKLOG.md` as viewport-dependent edge cases — not blocking launch.
