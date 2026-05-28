# Consent Flow + Age Gate — DRAFT

> **DRAFT — requires lawyer review.** Not yet shipped. Author is the legal-finance-agent and is **not a lawyer**. This is the legal/compliance spec for the consent flow and 18+ age gate. Frontend-agent ships the actual UI in a follow-up commit. Drafted against **DPDPA 2023 Sec 6** (consent must be free, specific, informed, unconditional, unambiguous, with clear affirmative action), **Sec 9** (children's data), **DPDP Rules 2025 Rule 3** (notice content) and **Rule 10** (verifiable consent for children), **IT Rules 2011 Rule 5** (consent for SPDI collection), and **Consumer Protection (E-Commerce) Rules 2020 Rule 5** (disclosure obligations).
>
> **Voice note for the founder:** consent UX is one of the few places where the Consultant's restrained voice and a compliance document have to share the same surface. The copy drafted here is **placeholder DRAFT** — copy-consultant-agent will sand it once you approve the structure. The legal load-bearing parts (the four affirmations, the age gate question, the policy version stamp, the audit trail fields) are not negotiable; the surrounding copy is.
>
> **Material change vs prior posture:** the prior privacy/terms drafts assumed implicit consent via "by using this product you accept…". That posture is **not defensible** under DPDPA Sec 6 for biometric data collection. The consent flow described here replaces implicit acceptance with explicit, granular, auditable consent.
>
> **Last updated placeholder:** `[DATE — to be set on publish]`

---

## 1. Where the consent surface appears

### Primary surface — start of the Aesthetic Audit

The consent flow appears as a single dedicated scene **between the landing-page CTA and Scene 1 of `/audit`**. Specifically: when a user clicks the "Begin the Audit" CTA on the landing page or any audit entry point, they land on a consent screen **before** they see Scene 1 (the "The room reads you before you speak." hook).

**Why here:** the audit funnel is where biometric data first enters the system. Photos are uploaded in Scene 3. Consent must be captured *before* the user has committed any data — meaning before Scene 1, not at the photo-upload step. This sequencing matches DPDPA Sec 6(1): consent must be obtained "before processing", not at the moment of processing.

### Secondary surface — paywall checkout

A condensed consent re-confirmation appears at the paywall checkout, with the four affirmations re-displayed as a read-only summary plus a single "I confirm the above" checkbox. This re-confirms consent at the point the user becomes a paying subscriber and locks in the subscription-tier-specific terms.

### Secondary surface — Orator enrolment (future)

When the WhatsApp channel goes live and Orator becomes publicly enrollable, a separate WhatsApp-opt-in consent appears on the Orator enrolment form (`/start?pillar=orator`). The Orator consent is structurally similar to the Lookmaxxing consent but covers WhatsApp message delivery, voice-note processing (when supported), and message-content scoring — not biometric photos. **Out of scope for v1** because the WhatsApp channel is dormant; spec is here as a placeholder so we don't forget when Meta approves the WABA.

### Re-consent surface

Triggered when:

- The `policyVersion` stamp stored on the user's account does not match the current policy version (i.e. the privacy policy has changed materially since the user last consented).
- A new processor has been added to the third-party processors list.
- The cross-border data transfer posture has changed (e.g. Sec 16 restriction notification).
- The biometric data processing scope expands (e.g. voice-note scoring is added for Orator users).

The re-consent surface intercepts the user's next session before they reach any data-collection or data-display surface. The user is shown a summary of what changed and the four affirmations again, with the relevant items re-presented.

---

## 2. What the consent says — the four affirmations

The consent flow uses **four independent checkboxes**. Each must be ticked individually — no master "agree to all" checkbox, no pre-ticked boxes. The CTA to continue is disabled until all four are ticked. This is the DPDPA Sec 6 "clear affirmative action" requirement and the Rule 3 informed-consent posture.

### Affirmation 1 — Age

> **DRAFT copy:** I am **18 years or older**. I understand misrepresenting my age is a breach of the Terms and will result in immediate account deletion.

**Why two clauses:** the first clause is the legal age gate. The second clause is the deterrent — it puts the consequence on the same line, where a casual lie costs less than reading the Terms in full.

### Affirmation 2 — Biometric processing by Google Gemini (US)

> **DRAFT copy:** I understand my face and scalp photos are uploaded to MainCharacter's servers and scored by **Google Gemini, an AI service operated from the United States**. The photos transit Google's US infrastructure during scoring. I have read and accept this in the Privacy Policy.

**Why this is the most important affirmation:** this is the cross-border data transfer disclosure (DPDPA Sec 16) for the most sensitive category of data we process. Naming Google by name, naming the United States explicitly, and naming the data category ("face and scalp photos") is what makes the consent "specific" and "informed" under Sec 6. **Do not water this down.** A lawyer may ask to soften the language; resist soft language here specifically.

### Affirmation 3 — Storage and retention

> **DRAFT copy:** I understand my photos are stored on **Cloudflare R2 cloud storage** and retained according to the schedule in the Privacy Policy: my baseline and Day-30 photos until I cancel, my last 7 daily mirrors and last 4 weekly hair photos on a rolling basis, all deleted within 30 days of cancellation or my erasure request.

**Why include the retention specifics:** Rule 8 of the DPDP Rules 2025 requires retention to be purpose-bound and disclosed. The Privacy Policy carries the detail; this affirmation carries the high-level promise so a user who only reads the consent (not the policy) still knows the retention model.

### Affirmation 4 — Privacy Policy and Terms of Service

> **DRAFT copy:** I have read and accept the **Privacy Policy** and the **Terms of Service**.

The two document names must be **clickable links** that open the documents in a modal or new tab. The consent state should track whether the user opened either document (event: `consent_doc_opened`, prop: `privacy | terms`); this is not legally required but is useful evidence in any future dispute about whether the user had access to the documents.

---

## 3. How consent is stored

A new database table, `consent_records`, captures every consent action. Schema (frontend-agent + backend-agent to implement; this is the legal spec):

```
consent_records
├── id                  (uuid, primary key)
├── user_id             (uuid, nullable — null for pre-signup consents)
├── anon_id             (string, the mc_anon_id cookie value — captured for pre-signup consents and stitched to user_id post-signup)
├── policy_version      (string, e.g. "1.0" — must match the version of the Privacy Policy in force at the time)
├── terms_version       (string, e.g. "1.0" — version of the Terms of Service in force at the time)
├── accepted_at         (timestamptz, server-side timestamp)
├── ip_address          (string, captured server-side from the request)
├── user_agent          (string, captured server-side from the request)
├── items               (jsonb array — one entry per affirmation:
│                         [
│                           { id: "age_18", accepted: true, label_hash: "<sha256 of the label text>" },
│                           { id: "biometric_gemini_us", accepted: true, label_hash: "..." },
│                           { id: "storage_retention", accepted: true, label_hash: "..." },
│                           { id: "privacy_terms", accepted: true, label_hash: "..." }
│                         ]
│                       )
├── surface             (enum: "audit_entry" | "paywall_checkout" | "orator_enrollment" | "reconsent")
└── source_ref          (string, nullable — e.g. audit_session_id for the audit-entry surface)
```

### Why hash the label text

Storing a SHA-256 hash of the displayed label means we can prove **exactly what wording the user saw** when they consented. If the consent labels are ever changed (a copy edit, a rewording for clarity), the hash differs and we can show which user saw which version. This is materially stronger than just storing the policy version — the policy version changes infrequently and on intentional updates, but consent labels can change as part of routine copy refinement.

### Why server-side timestamp + IP + UA

Evidence of consent must withstand a Data Protection Board investigation or a Consumer Disputes Redressal Commission complaint. Client-side timestamps are spoofable; server-side timestamps + IP + UA are the standard evidentiary record.

### Retention of consent records

Per the Privacy Policy retention schedule: consent records are retained for the duration of the account plus 7 years post-cancellation, as evidence of consent. The 7-year tail aligns with the Limitation Act 1963 default for actions in contract (3 years) plus generous tolerance for DPDPA Board-level scrutiny windows. `[CONFIRM WITH LAWYER]` — a lawyer may shorten this to 3 years or extend to match the income-tax record-keeping window.

> **Founder decision needed:** the 7-year retention of consent records means a user who erases their account still has their consent record retained (in pseudonymised form — name and contact are deleted, but the user_id, policy_version, accepted_at, IP, UA, items remain). Disclose this in the Privacy Policy retention table — it is the one exception to "we delete everything on erasure" and the lawful basis is "to evidence the consent given" (DPDPA Sec 7 — legitimate use, fulfilling a legal duty).

---

## 4. Re-consent triggers and mechanism

The user's account row stores the `policyVersion` and `termsVersion` they last accepted. On every authenticated session (and on the first page load of every pre-signup session, against the `mc_consent_v` cookie value):

1. Compare the stored version to the current published version.
2. If they match, proceed.
3. If they do not match, intercept the next request and route to the re-consent screen.

### What triggers a version bump (and therefore a re-consent prompt)

- Addition of a new third-party processor that handles user data.
- Change in the cross-border data transfer posture (e.g. a Section 16 restriction notification that requires us to change Gemini routing, or addition of a new jurisdiction for storage).
- Expansion of the biometric data categories (e.g. voice-note scoring for Orator users).
- Change in the retention schedule that extends storage.
- Material change to the Terms of Service that changes the user's rights or obligations.

### What does NOT trigger a version bump

- Routine copy edits to a policy section that do not change substance.
- Updates to the "Last updated" date for non-material clarifications.
- Cosmetic changes to a processor name (e.g. Razorpay re-branding).

> **Founder decision needed:** the founder owns the decision on whether a given change is material. Default posture: when in doubt, bump the version and prompt re-consent. The user-experience cost of an extra consent prompt is small; the legal cost of an under-disclosed material change is large.

---

## 5. Cookie banner posture

The current architecture (per the production push tonight) fires KPI events by default, with no separate analytics opt-in. **This is not defensible under DPDPA Sec 6 for analytics events that are not strictly necessary to deliver the page the user requested.**

### Recommended posture (target state, before launch)

A minimal cookie banner appears on the **first visit** of any non-logged-in user (anchored to the `mc_consent_v` cookie). The banner offers:

- **Essential cookies only** — the default if the user closes the banner without choosing. Enables `mc_anon_id`, `mc_consent_v`, and the auth token. Disables KPI event capture beyond the bare minimum (page-view-with-no-properties).
- **Accept analytics** — enables KPI events to fire with the full property set. Recorded as `mc_analytics_ok=true`.
- **Settings** — opens a panel listing each cookie / event category individually, with a toggle per category. (V2 — not blocking for launch.)

The banner is **not a wall**. The user can dismiss it and use the site. Dismissal is treated as "essential only", not as consent for analytics. This is the conservative read of DPDPA Sec 6 — silence is not consent.

### Why no third-party advertising banner

We do not run third-party advertising pixels (Meta Pixel, Google Ads, TikTok Pixel) on the landing or audit funnel. If that changes before launch, this section and the cookie banner change — third-party advertising cookies require an explicit opt-in and the banner becomes substantially more complex.

> **Founder decision needed (highest-priority of this document for the founder):** today, KPI events fire by default with no opt-in. To align with DPDPA Sec 6, one of two things has to happen before launch:
>
> 1. **Implement the cookie banner** described above, with `mc_analytics_ok` as a real gate that backend respects (events suppressed when false).
> 2. **Reduce KPI events to the strictly-necessary set** (page views only, no per-action events, no funnel events) until a real cookie banner ships, so the default-fire posture remains within DPDPA Sec 7 "legitimate use" (operating the service).
>
> Recommend option 1 if there is engineering capacity before launch; option 2 if launch must happen first. **Do not ship the production-state KPI capture without one of the two.**

---

## 6. WhatsApp opt-in (Orator, future)

When Orator becomes publicly enrollable (post-Meta WABA approval), a dedicated WhatsApp opt-in appears on the Orator enrolment form. It is structurally similar to the Lookmaxxing consent but covers different data categories:

- **DRAFT copy — Affirmation A:** I agree to receive WhatsApp messages from The Consultant at the number I provide, for the daily Orator protocol and related transactional communication.
- **DRAFT copy — Affirmation B:** I understand my text replies (and, when supported, my voice notes) will be processed by Google Gemini (United States) to score the work and generate my Evolution Report. I have read and accept this in the Privacy Policy.
- **DRAFT copy — Affirmation C:** I am 18 years or older.
- **DRAFT copy — Affirmation D:** I have read and accept the Privacy Policy and the Terms of Service.

WhatsApp opt-in is **separate** from the Lookmaxxing consent because Meta's own WhatsApp Business policy requires merchants to record explicit opt-in for marketing and utility messages. A user who only uses Lookmaxxing has not consented to receive WhatsApp messages.

Out of scope for v1 implementation; spec'd here so the structure is ready when the WhatsApp channel goes live.

---

## 7. Plain copy DRAFTS for the surfaces

> **These are DRAFT placeholders, not approved Consultant-voice strings.** Copy-consultant-agent will refine these once the founder approves the structure. The four affirmations above are the legal load-bearing parts; the surrounding copy is open for revision.

### Audit-entry consent screen

**Eyebrow (small, gold, Cormorant italic):**

> Before we begin.

**Headline (Cormorant italic, large):**

> *A few things to confirm.*

**Body (Sora, ink-dim):**

> The Audit reads your face. To do that responsibly, we need your explicit permission on four things. Read each one. Tick if you agree. The work begins after.

**Four checkboxes:** as drafted in Section 2.

**CTA (disabled until all four ticked):**

> Begin the Audit ◆

**Footer link:**

> Read the full Privacy Policy →   Read the Terms of Service →

### Paywall re-confirmation

**Headline (Cormorant italic):**

> *Confirm the consent you gave at the Audit.*

**Body (Sora, ink-dim, smaller):**

> You agreed to four things when you began the Audit. Re-confirm them now to start a paid subscription. (Each item from Section 2, displayed as read-only summary text.)

**Single checkbox:**

> I confirm the four items above and am ready to subscribe.

**CTA (disabled until ticked):**

> Continue to payment ◆

### Cookie banner (first visit, bottom of viewport)

**Body (Sora, small):**

> We use a minimum of cookies to make the product work — an anonymous ID, your login, and your consent state. We also capture light usage analytics. The analytics are optional.

**Two buttons:**

> Essential only   |   Accept analytics

**Footer link:**

> Privacy Policy →

### Re-consent screen

**Eyebrow:**

> Something has changed.

**Headline (Cormorant italic):**

> *Re-confirm your consent.*

**Body (Sora, ink-dim):**

> We updated the Privacy Policy on `[DATE]`. The change you need to know about: `[ONE-LINE SUMMARY OF THE MATERIAL CHANGE]`. Read the full Privacy Policy if you want the detail. Re-confirm the four items below to continue.

**Four checkboxes:** as in Section 2.

**CTA (disabled until all four ticked):**

> Continue ◆

---

## 8. What the founder ships vs what the lawyer reviews

| Item | Founder ships | Lawyer reviews |
|---|---|---|
| Surface placement (audit entry, paywall, re-consent) | After lawyer sign-off | Yes — confirm sequencing meets DPDPA Sec 6 "before processing" |
| The four affirmations (substance) | After lawyer sign-off | Yes — these are the legal load-bearing strings |
| Audit trail schema (`consent_records` table) | After lawyer sign-off | Yes — confirm fields meet evidence-of-consent standard |
| Re-consent trigger logic | After lawyer sign-off | Yes — confirm what counts as "material" |
| Cookie banner posture | After lawyer sign-off + founder decision on which option to take | Yes — confirm the default-deny posture for analytics |
| Surrounding copy (eyebrow, headline, body, CTA) | After copy-consultant-agent refines + founder approves | No — voice work, not legal |
| Visual treatment (the gold border, the ◆, the type) | Design-agent handles within design system | No |
| Frontend implementation | Frontend-agent ships after structure is approved | No |
| Backend implementation (consent_records writes, version comparison, re-consent middleware) | Backend-agent ships after structure is approved | No |

---

## 9. Sequencing — what has to ship in what order

1. **Lawyer reviews this document** alongside the Privacy / Terms / Refund drafts. Single joint review.
2. **Founder approves** the structure, the four affirmations, the consent_records schema, and one of the two cookie-banner options.
3. **Copy-consultant-agent refines** the surrounding copy (eyebrow, headline, body, CTA, banner text, re-consent screen) and the founder approves the strings.
4. **Backend-agent ships** the `consent_records` table, the write paths from each surface, the policy-version comparison middleware, the analytics gate that respects `mc_analytics_ok`.
5. **Frontend-agent ships** the consent screen at audit entry, the paywall re-confirmation, the cookie banner, the re-consent screen.
6. **QA-agent verifies** that the disabled CTA is genuinely disabled (no client-side bypass), that the consent_records write is happening on the server (not just the client), and that the cookie banner default-deny actually suppresses events at the backend (not just on the client).
7. **Privacy Policy and Terms publish.** With the consent flow live, the policies' references to "you consented at the Audit" become accurate.

**Critical:** **Do not publish the Privacy Policy or Terms of Service before the consent flow is live in production.** Publishing the policy without the consent mechanism in place creates a window in which the policy promises something the product does not deliver — a worse compliance posture than publishing nothing.

---

## 10. Risks this consent flow does not fully mitigate

For transparency:

- **Self-declaration of age** remains the only age verification. Recommended at v1, but a lawyer may push for DigiLocker-based verification — see Privacy Policy Section "Children's data".
- **Photo authorship cannot be verified.** A user can upload someone else's face. The Terms forbid it; the consent flow says "yours"; but the system cannot detect a third-party face. Mitigation is contractual (the user warrants the photo is of themselves), not technical.
- **A consenting user may still be coerced.** DPDPA Sec 6 requires consent to be "free" — given without external pressure. The system cannot detect coercion. The visible consent flow + the easy erasure endpoint are the best mitigation available at the product layer.
- **Cross-border posture may change.** If the Central Government issues a Section 16 restriction notification covering the US, every existing user must be re-consented under the new posture, or the Gemini path must be rerouted. The re-consent mechanism in Section 4 covers the former; the latter is an engineering project the founder should be ready for.

---

## References

- **DPDPA 2023** — Sec 6 (consent — must be free, specific, informed, unconditional, unambiguous, with clear affirmative action; withdrawal at any time), Sec 7 (legitimate use), Sec 9 (children's data), Sec 11 (right to access), Sec 12 (right to correction and erasure), Sec 16 (cross-border transfer).
- **DPDP Rules 2025** — Rule 3 (notice content — what must be told to the user before consent), Rule 8 (retention), Rule 10 (verifiable parental consent).
- **IT Rules 2011** — Rule 5 (consent for SPDI collection), Rule 7 (cross-border transfer of SPDI).
- **Consumer Protection (E-Commerce) Rules 2020** — Rule 5 (disclosure obligations).
- **Limitation Act 1963** — relevant to the consent-records retention tail.

---

> **End of draft.** This document is the missing piece between the Privacy Policy (which describes the consent regime in the abstract) and the production code (which has to capture and respect consent). Without this spec, the prior Privacy Policy draft's assertion of "consent obtained" was unbacked. Ship for joint lawyer review with the other three drafts.
