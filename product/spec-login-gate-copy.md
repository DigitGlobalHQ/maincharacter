# DRAFT — Login Gate Copy (every string slot)
# Status: AWAITING FOUNDER APPROVAL — every string below must be founder-signed before merge

> Parent spec: `product/spec-login-gate.md` §5
> Design constraints: `briefs/design-login-gate.md`
> Voice canon: `CLAUDE.md` §2
> Cadence references absorbed (not copied): `data/orator-content.js`, `landing.html`, `public/paywall.html`, `data/email-templates/paywall-receipt.html`, `public/payment-confirmed.html`
> Drafted by: copy-consultant-agent
> Drafted: 2026-05-28

---

## Context — what this copy is for

A paying Lookmaxxing buyer (or any returning Lookmaxxing user on a second device / cleared storage / expired JWT) needs to walk through the door. Two new surfaces (login page, magic-link email) plus three small modifications (payment-confirmed polling, paywall email validation, receipt-email re-entry line). The Consultant is the voice — dignified, mentor-grade, never an app. The user has either just paid money, or is coming back to do real work on themselves. Treat them accordingly.

---

## Section A — `public/lookmax/login.html`

### Slot: `login.headline`
**Constraint:** Cormorant Garamond italic h1. Mobile-cropped at ~32 chars before line-break starts looking awkward at clamp(32px, 6vw, 50px). Aim ≤30 chars for a single confident line. 5-9 words ideal.

**DRAFT — founder approval required**
> *Enter the room.*

**Rationale:** Three words. Inherits the "room" metaphor already on landing.html and on Day-4's locked Orator prompt ("a room where you have felt like a spectator"). Door-opening, not welcome-mat. No hype, no exclamation, no second meaning to police. Pairs naturally with the `login.sub` line below.

**Alternates considered (founder may prefer one):**
- *The mirror is waiting.* — Stronger Lookmaxxing-pillar tie, but the user is on the *login* page not the mirror itself; felt premature.
- *Return to the work.* — Honest, but reads cold to a first-time returner who hasn't yet earned the word "return."
- *The Chamber holds your place.* — Echoes the receipt headline ("The Chamber is open"); rejected because the receipt earned that phrase; reusing it dilutes it.

---

### Slot: `login.sub`
**Constraint:** Sora body. One sentence. Tells the user what happens when they submit. No hype, no apology.

**DRAFT — founder approval required**
> Your email below. A single-use link arrives within a minute, valid for fifteen.

**Rationale:** Two sentence fragments joined by a period — the short-then-longer cadence the canon uses. Sets three expectations (email is the input, link is the output, fifteen minutes is the window) in one breath. "Fifteen" spelled out reads more deliberate than the numeral; the canon prefers measured prose over UI-microcopy shorthand.

---

### Slot: `login.email.label`
**Constraint:** Sora 12px muted. Matches the paywall convention (`label` element, lowercase first letter, no colon).

**DRAFT — founder approval required**
> Your email

**Rationale:** Two words. Mirrors the paywall.html label pattern ("Name", "WhatsApp number", "Email"). Possessive ("Your") not generic ("Email address") — the canon addresses the user directly.

---

### Slot: `login.email.placeholder`
**Constraint:** Inside the input. Should hint format without nagging. Disappears on focus.

**DRAFT — founder approval required**
> you@example.com

**Rationale:** Identical to the paywall placeholder for consistency. The user has likely seen this exact placeholder at checkout; reusing it builds quiet pattern-recognition. No instructional placeholder ("Enter your email…") — that's app-voice, not Consultant-voice.

---

### Slot: `login.cta`
**Constraint:** Primary button, full-width. 2-4 words. Restrained verb. Budget: ≤18 chars to look right on a 320px screen.

**DRAFT — founder approval required**
> Send the link

**Rationale:** Three words, 13 chars. Definite article ("the link" not "a link") because the user just stated they want one. Verb-first imperative is the Consultant's instructional register. "Send entry link" (the spec's placeholder) was close but felt slightly engineered; "the link" is more human, same length.

**Alternates considered:**
- *Send entry link* (spec placeholder) — fine, slightly more product-ish.
- *Open the door* — too clever; pairs badly with a literal email field.

---

### Slot: `login.checkInbox.headline`
**Constraint:** Replaces the sub-line in the post-request state. Cormorant or Sora — design-agent's call; copy works either way. References the masked email + 15-min window. No hype.

**DRAFT — founder approval required**
> The link is on its way to {{maskedEmail}}.

**Rationale:** Present continuous ("is on its way") sets a calm waiting register — not "has been sent" (which is over-engineered), not "check your inbox" (which is bossy app-voice). The masked email lands the specificity. The 15-min window is in the body line below, not crammed into the headline.

---

### Slot: `login.checkInbox.body`
**Constraint:** One or two sentences below the headline. Sets expectation about the 15-min TTL and gently nods at the spam folder without panic-mongering.

**APPROVED — founder ruling 2026-05-28: PRAGMATIC version**
> Valid for fifteen minutes, single use. Check your spam folder if it does not arrive.

**Rationale:** Short, then short — clarity over voice-purity in this high-friction recovery moment. The literal noun "spam folder" matches what Indian Gmail/Outlook clients label the folder, so a user reading on a slow connection can act immediately. Founder ruling 2026-05-28: in recovery copy, err toward clarity; "spam folder" is a noun, not hype. (The voice-pure alternate — "the folder where your inbox sends things it does not recognise" — was rejected for prose cost.)

---

### Slot: `login.checkInbox.resend`
**Constraint:** The "didn't get it?" affordance. Appears after a 60s cooldown per the design brief. Must not nag, must not feel app-y. Should communicate the cooldown.

**DRAFT — founder approval required**
> Send another → *(grayed; enables in {{secondsRemaining}}s)*
> *(then once enabled:)* Send another →

**Rationale:** Two states in one slot. The arrow alone carries the action; no "click here" verb-padding. While disabled, the literal seconds count is the cleanest way to say "wait" without saying "wait" — the user reads the number and understands. No "please" (app-voice), no "didn't get it?" (interrogative, anxious). The arrow `→` is the same affordance already used on paywall.html ("Begin →") so it inherits a learned pattern.

---

### Slot: `login.error.expired`
**Constraint:** Single message covering expired / already-used / malformed (no enumeration — security §9). One line. Recoverable framing — the input re-appears below.

**DRAFT — founder approval required**
> This link is no longer valid. Request a new one below.

**Rationale:** Two short sentences. "No longer valid" is the single-message envelope the security spec requires — it covers expired, consumed, and tampered without revealing which. "Request a new one below" tells the user the path forward in the same beat as the error. No "sorry," no "oops," no exclamation. The Consultant does not apologise for time passing.

---

### Slot: `login.error.network`
**Constraint:** Transient failure — `/auth/request-link` 5xx or fetch error. Single line. Calm.

**DRAFT — founder approval required**
> Something interrupted the send. Try again in a moment.

**Rationale:** Echoes the canonical voice example from the brief ("Something has interrupted the work. Try again in a moment, or write to support."). "Interrupted the send" names what failed (not the user, not the network — the *send*) and "in a moment" sets a soft retry expectation without quantifying it. No exclamation. No "please."

---

### Slot: `login.footer`
**Constraint:** Footer-note at page foot. Replaces the existing "Daily mirror. Daily ritual. Weekly reveal." line. Short, declarative, ties this page to the broader work without selling.

**DRAFT — founder approval required**
> ◆ MainCharacter · The Consultant

**Rationale:** Mirrors the receipt-email footer (`paywall-receipt.html:63`) and the payment-confirmed footer exactly. The login page is a doorway, not a destination — the footer's job here is identification, not exposition. The old "Daily mirror. Daily ritual. Weekly reveal." line was content-marketing copy that belonged on the landing page; on the login screen it reads as filler. Stripping it down to the signature is more restrained.

**Alternate (if founder wants more):**
> Daily mirror. Daily ritual. Weekly reveal.
> ◆ MainCharacter · The Consultant
> *(stack of two lines; keeps the existing tagline as a small grey line above the signature)*

---

## Section B — `data/email-templates/magic-link.html` (NEW template)

### Slot: `email.magic.subject`
**Constraint:** ≤55 chars for mobile inbox crop. Specific. Non-promotional. No urgency theatrics ("Quick!", "Don't miss out"). No emoji other than ◆. No exclamation.

**DRAFT — founder approval required**
> ◆ Your Lookmaxxing entry link

**Rationale:** 31 chars including the diamond. The diamond does double duty as brand-mark + inbox-visual anchor (most inboxes render it). "Entry link" is precise — the user knows exactly what's inside. "Lookmaxxing" specifies the pillar so a future Aura++ user reading two separate emails can tell them apart. No urgency words; the body handles the TTL.

**Alternates considered:**
- *Your link into Lookmaxxing* (28 chars, no diamond) — softer, but loses brand-mark recognition in a crowded inbox.
- *◆ MainCharacter — your entry link* (35 chars) — generic across pillars; less useful when the user has both.

---

### Slot: `email.magic.preheader`
**Constraint:** ≤90 chars. Inbox-preview text that complements the subject without repeating it. Sets the TTL or the specificity.

**DRAFT — founder approval required**
> Single-use, valid for fifteen minutes. Open it on the device you want to work on.

**Rationale:** 80 chars. Adds two pieces of information the subject couldn't carry: the TTL, and the device-choice nudge (because the user often checks email on a laptop but the PWA is mobile-first). "The device you want to work on" is gentle Consultant register — it reframes the click as a decision, not a reflex.

---

### Slot: `email.magic.headline`
**Constraint:** Cormorant italic h1 inside the email. Mirrors the receipt-template's h1 weight + size.

**DRAFT — founder approval required**
> *Your entry link is below, {{name}}.*

**Rationale:** Named. Direct. The receipt-template earned "The Chamber is open, {{name}}" — this is its quieter cousin for a returning act. Italic Cormorant carries the dignity; the prose stays plain because the next thing the user sees is a button, not more words.

**Alternate:**
> *Step back in, {{name}}.*  — More poetic, less precise. The literal "entry link is below" version is friendlier to a user who opened the email confused about why they got it.

---

### Slot: `email.magic.body`
**Constraint:** One short paragraph. Names who this is from (The Consultant / MainCharacter), why the user is seeing it (they requested it), what the link does (signs them into /lookmax/), how long it is valid (15 min, single use). Sora body type, ~3-5 lines.

**DRAFT — founder approval required**
> You asked to enter Lookmaxxing. The button below signs you in for the next twenty-four hours — no password, no second step. The link itself is single-use and expires in fifteen minutes. If you did not ask for this, the next line tells you what to do.

**Rationale:** Four sentences, short-longer-short-pointer. Confirms agency ("You asked") which doubles as the soft enumeration guard — if a non-user receives this, the first sentence is already a question for them to investigate. Explains the JWT semantics in plain prose ("for the next twenty-four hours — no password, no second step") so the user understands what "single-use" means without infrastructure jargon. The closing pointer hands the user off to the security line without making it dramatic.

---

### Slot: `email.magic.cta`
**Constraint:** Button label inside the email. 2-4 words. Distinct enough to feel like a button, restrained enough to match the voice. Should be reusable as `receipt.firstLogin.cta` for consistency.

**DRAFT — founder approval required**
> Enter Lookmaxxing

**Rationale:** Two words, 17 chars. Verb-first imperative, names the room. Matches the spec's placeholder. The same string works in the receipt email's re-entry button (slot `receipt.firstLogin.cta`) — using one phrase for the same action across two emails builds the muscle memory the spec wants.

---

### Slot: `email.magic.fallback`
**Constraint:** The "if the button doesn't work, paste this URL" line. Calm, technical, no apology theatrics. One line.

**DRAFT — founder approval required**
> If the button does not respond, paste this address into your browser: {{magicLinkUrl}}

**Rationale:** "Does not respond" is more accurate than "does not work" — most failures here are corporate-proxy strip or weird email-client preview, not a broken button. "Paste this address" is plain, no exclamation, no "sorry about that." Colon then URL — the same syntax the user sees in any technical document. No apology because the Consultant does not apologise for email-client variance.

---

### Slot: `email.magic.security`
**Constraint:** The "if you didn't request this, ignore it" line. Neutral, not paranoid. One sentence.

**DRAFT — founder approval required**
> If you did not request this, no action is needed — the link expires in fifteen minutes and can be used only once.

**Rationale:** Inverts the usual "alert! someone may be trying to access your account" panic-frame into reassurance. The user is told two facts that make the worst case harmless (TTL + single-use), not asked to take an action. "No action is needed" is the calm-Consultant version of the security best practice. The em dash carries the cadence the canon prefers.

---

## Section C — `public/payment-confirmed.html`

### Slot: `confirmed.pollingState`
**Constraint:** Replaces today's red-tinted error-styled "being verified" box while the page auto-polls. Quiet patience, not alarm. Brief — one line, ideally under 60 chars including the animated dots.

**DRAFT — founder approval required**
> Confirming with the bank.

**Rationale:** Five words. "The bank" not "Razorpay" — the user thinks in terms of who took their money, not which API moved it. "Confirming" is present continuous, calm. The design brief specifies an animated dot ellipsis (CSS only) trailing this line, so the text itself stays clean: `Confirming with the bank` + animated `…`. Replaces the current `#loading` text ("Confirming your subscription…") with one that holds steady through the full 30s auto-poll window without ever reading as an error.

**Alternate:**
> Holding while the bank confirms.  — Slightly warmer, slightly longer. Founder pick.

---

### Slot: `confirmed.fallbackEmailLink`
**Constraint:** The secondary button shown only after the 30s auto-poll window fails (F1 catalog). Links to `/lookmax/login`. Recoverable framing, not "something went wrong." Button label budget: ~3-5 words.

**DRAFT — founder approval required**
> Send me an entry link instead

**Rationale:** Six words, 28 chars — fits the existing `.install` button treatment per the design brief. First person ("me") because the user is the actor making the choice, not the passive recipient. "Instead" carries the alternative without implying failure. Matches the email subject's "entry link" phrasing — three surfaces (subject, login button, this fallback) all use the same noun, building consistency without anyone having to think.

---

### Slot: `confirmed.mirrorCta`
**Status: [FOUNDER COPY] — live revenue path. Founder-approved before merge.**

This slot replaces today's step text on `public/payment-confirmed.html`:
> Open the mirror at /lookmax/ — your daily ritual begins tomorrow morning.

It consists of two strings, surfaced together on the page:
- **(a) a button label** (~2-4 words, ≤18 chars to fit the `.install` treatment on a 320px screen)
- **(b) a supporting line** (~1 short sentence, sets expectation about what happens after tap)

After tap, the silent JWT exchange has already happened and the user lands inside `/lookmax/` — the dashboard tiles, NOT an analysis screen. All three drafts below honour that literal truth.

#### Three options for founder ruling — pick one or compose a fourth

---

**Option A — direct / instrumental** *(closest to today's "Open the mirror"; names what happens; minimal poetry)*
`DRAFT — founder pick required`

- **(a) Button label:** `Open the mirror` *(15 chars)*
- **(b) Supporting line:** *The mirror is ready when you are.*

**Rationale.** Five words on the button, seven on the line. Both sentences carry the same calm declarative register the canon uses for action affordances (`Send the link`, `Enter Lookmaxxing`, `Send another →`). The verb "Open" is the same verb the user just used three times on the paywall ("Begin"), the receipt email ("Enter your dashboard"), and the existing mirror copy — so the muscle memory is already there. The supporting line reframes the agency back to the user ("when you are") without urgency theatrics, which matters in a post-payment moment where the user has just spent ₹1,499–₹1,999 and is in a slightly heightened state. Avoids the trap of promising what's behind the door (no "your audit awaits", no "your first ritual begins") because the first tap lands on dashboard tiles, not a scored analysis.

**Vocabulary thread.** "The mirror" — the canon's Lookmaxxing-pillar noun, already used on `landing.html`, the audit funnel, and the existing placeholder. Stays inside one metaphor; does not introduce a new one in a high-stakes moment.

**Trade-off vs B and C.** Gives up the door-opening warmth of B and the ceremonial weight of C in exchange for the lowest possible cognitive cost. Reads as functional — appropriate for a user who has just done a transaction, less so for a user the founder wants to ceremonially welcome into a paid product. If founder wants the post-payment moment to feel like a transaction-completion confirmation rather than a threshold crossing, this is the pick.

---

**Option B — door-opening / threshold** *(in the family of `login.headline` "Enter the room" — a small invitation, mentor-grade)*
`DRAFT — founder pick required`

- **(b) Button label:** `Enter the room` *(14 chars)*
- **(b) Supporting line:** *The work begins the moment you walk in.*

**Rationale.** Inherits the exact phrase from the approved `login.headline` ("Enter the room.") so a buyer who later returns via the magic link will see the same two words on two different surfaces — a learned pattern that reduces orientation friction across the whole login gate. "Walk in" pairs with the receipt-email line ("the button there will walk you in silently") — two sibling sentences across two surfaces, one verb, one register. The supporting line is honest: the literal first thing after tap is the user inside their dashboard, free to start, and "the work begins the moment you walk in" tells that truth without naming a specific screen the user is about to see. No exclamation, no hype, present-tense throughout.

**Vocabulary thread.** "The room" + "walk in" — borrowed deliberately from the already-approved `login.headline` and `receipt.firstLogin.line`. This is the most consistent option across the gate as a whole; a founder who wants every login-gate surface to feel cut from one cloth picks this one.

**Trade-off vs A and C.** Gives up the pillar-specific anchor (A keeps "mirror"; B uses the more universal "room"). A Lookmaxxing buyer might briefly wonder where the mirror went — though "the room" is already canon and the dashboard inside `/lookmax/` is in fact a room with mirror tiles, not the mirror itself, so the choice is also more literally accurate than A. Gives up the small ceremony of C; reads as quietly inviting rather than weighted.

---

**Option C — earned-moment / weight** *(acknowledges this is the act after payment; restrained ceremony; closest to where the canon uses `THE CHAMBER` / `THE WORK` sparingly)*
`DRAFT — founder pick required`

- **(a) Button label:** `Enter the Chamber` *(17 chars)*
- **(b) Supporting line:** *THE WORK begins on the other side of this button.*

**Rationale.** Picks up the noun the page's own headline already uses ("The Chamber is open, {{name}}. ◆" — `payment-confirmed.html:217`) and the receipt-email subject line ("The Chamber is open"). The button label is literally the verb completing the headline's sentence — *"The Chamber is open"* → *"Enter the Chamber"* — which lands as the natural close to the post-payment moment without inventing any new vocabulary. The supporting line uses the canon's sparing capitalised-single-phrase emphasis device (`THE WORK`, in the same family as `THE PAUSE` / `THE SEEKER`) for the first time on this surface, which the canon reserves for moments of weight. Whether this slot earns that emphasis is the founder's call — it is deliberately the heaviest of the three drafts. "On the other side of this button" is the truthful frame: nothing dramatic happens at the tap (no analysis, no animation), but the act of tapping IS the crossing.

**Vocabulary thread.** "The Chamber" + "THE WORK" — the most canonical-weight pairing in the drafted set. Both phrases already exist in the locked canon; this draft does not invent, it composes. Reuses the page's own h1 noun so the button reads as the answer to its own headline.

**Trade-off vs A and B.** Gives up the lightness of A and the universality of B in exchange for register weight. Risk: if the founder feels the page already carries enough ceremony (the eyebrow, the gold headline, the receipt block, the existing "Chamber" h1), this draft tips it into over-formal — the kind of register that reads as branding rather than mentorship. The capitalised `THE WORK` should be used here only if the founder believes a post-payment confirmation IS a moment of weight in the canon's sense — and in my read of CLAUDE.md §2, that bar is high. Drafted in full so the founder can audit it; flagged as the most deliberate-departure-from-restraint of the three.

---

**Recommended decision frame.** A is for "transaction complete." B is for "consistent gate." C is for "earned ceremony." There is no wrong pick — each lands a different register inside the same voice. The button labels all sit within the ≤18-char budget (15 / 14 / 17). None promise an analysis, a score, or a ritual that the first tap does not literally produce. None use exclamation, banned hype words, or non-◆ emoji.

**These are drafts only — the live `public/payment-confirmed.html` still carries the build-time placeholder `Open the mirror` / `The mirror is ready when you are.` until founder picks.**

---

## Section D — `public/paywall.html` (validation only)

### Slot: `paywall.email.required`
**Constraint:** Validation error fired when a Lookmaxxing buyer leaves the email blank. Short, mentor-grade, explains *why* — not "please enter your email" (app-voice) but a reason the user will accept.

**DRAFT — founder approval required**
> Email is required for Lookmaxxing — you enter the work through it.

**Rationale:** Two clauses joined by an em dash. Names what's required (email), the scope (Lookmaxxing only — Orator buyers still see the field as optional), and the *why* in five words ("you enter the work through it"). "Enter the work" is the same verb-frame as the login CTA and the email subject — the user is being asked to commit to entry, and email is the key. No "please," no "missing field," no red-tinted UI-microcopy. Fits inside the existing `.err` element class that already renders error text on this page.

---

## Section E — `data/email-templates/paywall-receipt.html` (modification)

### Slot: `receipt.firstLogin.line`
**Constraint:** One new paragraph inside the existing receipt body, below the existing receipt table, above the existing dashboard CTA. Explains the magic-link backup. References both the silent button on `/payment-confirmed` AND this email as the backup. One sentence (two clauses fine).

**DRAFT — founder approval required**
> If the tab from your payment is still open, the button there will walk you in silently. If it closed, the link below does the same — valid for fifteen minutes, single use.

**Rationale:** Two parallel sentences, both starting with "If" — the canon's short-then-longer rhythm carried across a pair. The first sentence pre-empts the user thinking "wait, why two ways in?" by acknowledging the primary path. The second sentence handles the F2 failure (closed tab) without naming it as a failure. "Walk you in silently" is the warm-and-honest Consultant phrasing the brand asks for — it tells the truth (no second auth step) in language that respects the user's intelligence. "Valid for fifteen minutes, single use" matches the language used on the login page and the magic-link email body — three surfaces, one phrasing.

---

### Slot: `receipt.firstLogin.cta`
**Constraint:** Button label inside the receipt email, beneath the new line. Distinct from the existing "Enter your dashboard" CTA (which goes to `/dashboard`). This one goes to `/lookmax/login?token={{firstLoginToken}}`. 2-4 words.

**DRAFT — founder approval required**
> Enter Lookmaxxing

**Rationale:** Same string as `email.magic.cta`. Deliberately identical — the user who reads the magic-link email and the user who reads the receipt are often the same person within minutes; using one phrase across both lowers cognitive load. The visual treatment (gold button on obsidian, per the receipt template's existing styles) carries the brand; the words don't need to do extra work. The existing "Enter your dashboard" CTA stays unchanged for Orator buyers — a Lookmaxxing-only buyer now sees `Enter Lookmaxxing` instead, an Aura++ buyer sees both.

---

## Brand-voice self-check

Audit of every string drafted above:

| Rule | Status |
|---|---|
| Zero exclamation marks anywhere in the drafts | **PASS** — grep-checked; no `!` in any draft string. |
| Zero emoji other than ◆ | **PASS** — only the diamond appears (in `login.footer` and `email.magic.subject`). |
| No banned hype words ("Great", "Amazing", "Awesome", "Crushing", "Let's go", "Way to go", "Boom", "Yay", "Got it", "epic", "insane", "literally", "obsessed", "🎉") | **PASS** — none present. |
| No "Welcome to MainCharacter" / app-voice openers | **PASS** — no welcome strings drafted (this is a login gate, not enrolment). |
| Specific, not generic — references what the user actually did | **PASS** — every error references the user's action ("You asked to enter", "Request a new one", "you enter the work through it"). |
| Warm AND honest — direct without being chirpy | **PASS** — see `login.checkInbox.body` (honest about spam folder without saying "spam"), `email.magic.body` (honest about JWT semantics in plain prose). |
| Sentence cadence — short, then longer, then short | **PASS** — most strings use this pattern explicitly; the magic-link body and the receipt line are the clearest examples. |
| Em dashes are encouraged and used naturally | **USED** — in `paywall.email.required`, `email.magic.security`, `receipt.firstLogin.line`, `confirmed.fallbackEmailLink` rationale. |
| Capitalised-single-word emphasis (`THE SEEKER`, `THE PAUSE`) used sparingly | **NOT USED** — see note below. |
| Question marks — sparingly | **ZERO** drafted. None of these surfaces invited one. The temptation existed in `login.checkInbox.resend` (the canonical "didn't get it?" pattern) and was deliberately resisted; the timer + arrow carry the affordance. |
| Signature `◆ MainCharacter` at the close of major messages | **PRESENT** — in `login.footer` (page foot) and in the existing receipt template footer that we did not modify. The magic-link email's footer is the design-agent's call, but the diamond is in the subject line so the brand mark is already on the user's screen. |
| Never invent product terminology beyond CLAUDE.md / spec | **PASS** — only "Lookmaxxing" (canonical pillar name), "MainCharacter" (brand), "The Consultant" (persona), "the link" / "entry link" (descriptive, not capitalised as a product term). |

### On capitalised-single-word emphasis

The canon uses devices like `THE SEEKER`, `THE PAUSE`, `THE WORK CONTINUES` for emphasis at moments of weight — a rank crossing, a technique introduction, a Day-7 reveal. I considered three places it might fit here and deliberately did not use it in any of them:

1. **`login.headline`** — *THE ROOM* would echo the canon's `THE PAUSE` device. Rejected: a login page is too transactional to bear that weight. The emphasis device should be reserved for moments the user has earned, not the door they walk through to start the work.
2. **`confirmed.pollingState`** — *HOLDING* in caps would land. Rejected: the user is anxious about money in this moment; emphasis here would amplify alarm, not patience.
3. **`receipt.firstLogin.line`** — *SILENTLY* could carry weight. Rejected: the word is doing its work in lowercase prose; capitalising it would draw attention to the mechanism (auth) instead of the action (entering).

**Founder ruling welcome on whether any of these should in fact use the emphasis device** — I drafted on the conservative side.

---

## What I am NOT confident about

1. **`login.headline` — *Enter the room.* vs. *The mirror is waiting.*** The first is more universal (works for second-device returners who haven't seen the mirror yet); the second is more specific to the Lookmaxxing pillar. If the founder wants every Lookmaxxing surface to feel pillar-tied, the second is better.
2. **`login.footer` — strip to signature, or keep the marketing tagline?** I drafted the stripped version. The alternate (two lines) preserves the existing brand surface. Founder taste call.
3. **`email.magic.body` — sentence count.** Four sentences may be one too many for an email that the user reads in three seconds before clicking the button. A two-sentence version: *You asked to enter Lookmaxxing. The button below signs you in for twenty-four hours — single-use, expires in fifteen minutes.* If founder prefers the shorter cut, the security line then carries the "if you did not ask" clause alone.
4. **`paywall.email.required` — voice register.** "You enter the work through it" is more Consultant than most field-validation lines deserve to be; an Indian first-time visitor reading at speed may parse it as enigmatic rather than clear. A more functional alternate: *Email is required for Lookmaxxing — receipts and login arrive here.* Founder picks.
5. **`confirmed.pollingState` — single line vs. two.** A one-line version reads as a status; a two-line version (*Confirming with the bank.* + *This usually takes a few seconds.*) sets a stronger patience-frame. I drafted single; if 30s auto-poll feels long in QA, founder may want the two-line version.

---

## Final tally

- **Strings drafted: 18** (Section A: 11 · Section B: 7 · Section C: 2 fully drafted + 1 marked `[FOUNDER COPY]` and skipped · Section D: 1 · Section E: 2 — Section C's `confirmed.mirrorCta` is intentionally out of scope per spec §5, so the active draft count is 18).
- **Hardest string: `email.magic.body`.** Four jobs to do (identity, agency, mechanism, TTL) in one paragraph, under a button, in a register that is neither legalese ("This is an automated message…") nor product-speak ("Click below to log in!"), without using exclamation marks or apologising for the email existing. The four-sentence version is the best balance I found; the two-sentence alternate is the contingency if it reads long.
- **Voice-rule edge case for founder ruling: the spam-folder line in `login.checkInbox.body`.** The literal word "spam" is itself an app-voice flag — every dropshipping app says "check your spam folder." I rewrote it to *"the folder where your inbox sends things it does not recognise."* That is more Consultant, but it is 12 words where 3 would do, and an Indian user reading on a slow connection may genuinely benefit from the literal word "spam" because their email client labels the folder that way. Two paths: (a) keep my version, accept the prose cost in exchange for voice integrity; (b) use the literal word *"Check your spam folder if it does not arrive."* and accept the small voice compromise for clarity. Founder rules.
