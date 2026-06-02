# Copy approval — auth + dashboard epic (2026-06-02)

Every user-facing string shipped across PRs A, C, and E is **DRAFT** and gated behind
flags / unset email — nothing has reached a real user. This is the single place to
approve them. Once you sign off, I apply the approved words, remove the `TODO copy
review` markers, and the only thing left to go live is config (RESEND keys, flags,
Google credentials).

## How to use this doc
For each row: **keep** it, or write your replacement after **→**. The Consultant voice
is yours — change anything. I will not ship a single one of these until you approve.

**Brand guardrails (from CLAUDE.md §2), already followed in the drafts:** dignified,
restrained, no hype, no exclamation marks, no emoji except ◆, no shaming, no medical/
supplement/procedure/dosage language.

---

## 1 · Email OTP — the sign-in code email  (PR A · `data/email-templates/email-otp.html`, `services/email.js`)

| Slot | Draft | Keep / edit |
|---|---|---|
| Subject | ◆ Your MainCharacter sign-in code | → |
| Preheader (inbox preview) | Your single-use sign-in code, valid for ten minutes. | → |
| Headline | *Your sign-in code, {name}.* | → |
| Body | Enter the six digits below on the sign-in screen. The code is single-use and expires in ten minutes. | → |
| Security note | If you did not request this, no action is needed — the code expires in ten minutes and can be used only once. | → |
| Footer | ◆ MainCharacter · The Consultant | → |

*(The 6-digit code itself sits in a gold box between body and security note.)*

---

## 2 · Email OTP — the on-screen sign-in steps  (PR A · `public/lookmaxing/start.html`)

| Slot | Draft | Keep / edit |
|---|---|---|
| Request button | Email me a code → | → |
| Code-entry prompt | Enter the six-digit code we emailed you. | → |
| Verify button | Verify → | → |
| Wrong-code error | That code did not match. Check it and try again. | → |

---

## 3 · Welcome email — first sign-in only  (PR C · `data/email-templates/welcome.html`, `services/email.js`)

| Slot | Draft | Keep / edit |
|---|---|---|
| Subject | ◆ Welcome to MainCharacter | → |
| Preheader | You have taken the first deliberate step. | → |
| Headline | *Welcome, {name}.* | → |
| Body (3 lines) | You have taken the first deliberate step. ⏎ From here, the work is simple in shape and demanding in practice: make the gap between who you are and who you intend to become visible, measurable, and closable. One ritual at a time. ⏎ We will meet you in the work. | → |
| CTA button | Enter your space  *(links to the dashboard)* | → |
| Footer | ◆ MainCharacter · The Consultant | → |

---

## 4 · Dashboard "Your Journey"  (PR E · `public/lookmax/index.html` → `JOURNEY_COPY`)

| Slot | Draft | Keep / edit |
|---|---|---|
| Section eyebrow | YOUR JOURNEY | → |
| Section subhead | Every reading, in order. | → |
| Timeline eyebrow | YOUR READINGS | → |
| Reading count | "1 reading" / "{n} readings" | → |
| Baseline row label | Baseline reading | → |
| Re-audit row label | Re-audit | → |
| Row affordance | View ◆ | → |
| Show-all link | Show all readings ◆ | → |
| Aura module title | AURA OVER TIME | → |
| Aura 1-point caption | One reading so far. The line begins at your next. | → |
| Aura summary (up / down / flat) | +{n} since baseline / {n} since baseline / No change since baseline. | → |
| Axes module title | WHERE YOU'VE MOVED | → |
| Axes subhead | Baseline → Now | → |
| Axes pre-re-audit teaser | Your 8-axis comparison appears after your first re-audit. | → |
| Mirror module title | THE MIRROR, OVER TIME | → |
| Mirror count caption | mornings logged | → |
| Mirror 0-state caption | Your first morning is waiting. | → |
| Mirror streak line | Longest streak — {n} days | → |
| Hair module title | HAIRLINE | → |
| Hair 1-reading caption | Tracking begins now. | → |
| Hair stage-held line | Stage held at {stage} for {n} reading(s). | → |
| First-chapter quote | This is your baseline. Everything after this is movement. | → |
| First-chapter next-reading | Your next reading unlocks in {n} days. / Your re-audit unlocks after 30 days. | → |
| Error retry | Couldn't load your journey. Retry ◆ | → |

### 4b · 8-axis display labels (`AXIS_LABELS`)
These are just human labels for the scoring axes — confirm wording or adjust:

Skin clarity · Jaw definition · Eye area · Hair density · Posture · Facial harmony ·
Expression · Body composition  *(legacy keys also mapped: Symmetry, Hairline, Leanness, Grooming)*

---

## After you approve
1. I apply the approved strings across the 4 surfaces and remove all `TODO copy review` markers (one small PR).
2. You set the go-live config in Render:
   - **Email:** `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, then `LOOKMAX_EMAIL_LOGIN=true` (turns on OTP + welcome).
   - **Google:** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `JWT_SECRET` (see `GOOGLE_OAUTH_SETUP.md`).
3. Spot-check live per each PR's checklist.

That's the last gate between here and the whole sign-in + dashboard system being live.
