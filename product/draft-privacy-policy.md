# Privacy Policy — DRAFT

> **DRAFT — requires lawyer review.** Not yet shipped. Author is the legal-finance-agent and is **not a lawyer**. This is a starting point for a real Indian privacy / IT lawyer (DPDPA experience preferred) to refine before it goes live. Drafted against the **Digital Personal Data Protection Act, 2023** (DPDPA) and the **DPDP Rules, 2025** (notified 13 Nov 2025, 18-month phase-in ending ~mid-May 2027). Sources cited at the bottom.
>
> **Voice note for the founder:** restrained register, stripped of the ◆ mark and capitalised emphasis. A privacy policy is a legal document first and a brand artefact second — restraint is fine, performance is not. The copy-consultant-agent can sand the headlines later once a lawyer has signed the substance.
>
> **Material change vs prior draft (28 May 2026):** rewritten to reflect the production state — Postgres (Neon, Singapore region) for user/audit/event data, Cloudflare R2 for photos, Google Gemini (US) for biometric inference, web-push subscriptions, KPI events, DPDPA Sec 11/13 data-export and data-erasure endpoints, comp-account paid status, and an explicit biometric data section because face/scalp images are the most sensitive data the product handles and the previous draft underplayed the cross-border transfer issue.
>
> **Last updated placeholder:** `[DATE — to be set on publish]`
> **Policy version:** `[VERSION — e.g. 1.0, increments on every material change; stored against each user's consent record so we know which version they accepted]`

---

## Who we are

MainCharacter is a personal-growth product operated by **Digit Global Services** ("we", "us", "our"). MainCharacter is the consumer-facing name of the product; Digit Global Services is the legal entity that collects, processes, and is accountable for your personal data. In the language of the DPDPA, Digit Global Services is the **Data Fiduciary** and you, the user, are the **Data Principal**.

- **Legal name:** `[FOUNDER TO FILL — e.g. Digit Global Services LLP / Digit Global Services Pvt Ltd / sole proprietorship]`
- **Registered office:** `[FOUNDER TO FILL — see Contact page draft; this single missing field blocks all four documents from going live and is flagged once per document.]`
- **Contact:** see "Grievance Officer" section below and the Contact page.

> **Founder decision needed:** confirm the exact registered name (LLP / Pvt Ltd / sole proprietorship). The full legal name with suffix must appear here verbatim and must match Razorpay KYC records.

---

## What we collect, and why

We only collect what we need to deliver the product you signed up for. We do not sell your data. We do not share it for anyone else's marketing.

| Data | When we collect it | Why we need it | Legal basis under DPDPA |
|---|---|---|---|
| **Name** | Enrollment, paywall checkout | To address you in WhatsApp messages, emails, and the PWA | Consent (Sec 6) |
| **Phone number** | Enrollment, paywall checkout | Primary account identifier; how The Consultant reaches you over WhatsApp; OTP login fallback | Consent + legitimate use (Sec 7 — service delivery) |
| **Email address** | Paywall checkout (required for Lookmaxxing; optional for Orator-only) | Payment receipts, login recovery, transactional notices | Consent + legitimate use |
| **Daily message replies (text)** | Each day of your Orator protocol | Scored by Gemini across five dimensions to generate your Evolution Report | Consent |
| **Voice notes** (when supported in a later Orator release) | Each day of your Orator protocol | Transcribed and scored alongside text replies | Consent |
| **Face photos** — Aesthetic Audit (front face, side profile, full body) | Once, at the start of the free Audit funnel | Computes your baseline Aura Score across 8 axes and personalises your protocol | Consent (see "Biometric data" section below) |
| **Face photos** — daily mirror selfies | Daily, inside the Lookmaxxing PWA | Scored by Gemini Vision across 8 axes; trend chart, weekly reveal, Day-30 re-audit | Consent (see "Biometric data" section below) |
| **Scalp photos** — weekly hair tracker (front + crown) | Weekly, inside the Lookmaxxing PWA | Estimates Norwood stage, hair density, recession; informs the hair protocol | Consent (see "Biometric data" section below) |
| **Payment metadata** (subscription ID, plan, amount, billing dates, payment status) | Each Razorpay transaction | Account state, billing, refunds, dispute handling | Legitimate use (Sec 7 — contractual) + Consent |
| **Web-push subscription** (browser push endpoint + cryptographic keys) | Once, when you opt in to push notifications inside the PWA | Send the 7:30 IST daily mirror nudge and other operational notices | Consent — push notifications are opt-in only |
| **Device and session metadata** (IP address, user-agent, login timestamps) | Each visit | Security, fraud prevention, rate-limiting, breach forensics | Legitimate use (Sec 7) |
| **Cookies / localStorage** (`mc_anon_id` anonymous cookie + auth token in localStorage) | Each visit | Stitches your pre-login behaviour to your account after signup; keeps you logged into the PWA between sessions | Essential cookies — see "Cookies" section below |
| **KPI events** (page views, audit lifecycle, mirror/protocol/hair actions, payment events) | While you use the product | Product analytics — what works, what breaks, where users drop off. Stored per-user (or per-anon-cookie before signup). Properties are limited to non-PII metadata. | Consent (analytics) — see "Analytics" section below |

We do **not** collect:
- Card numbers, CVV, UPI PINs, or any payment instrument detail. Razorpay handles all of that on its own infrastructure. We only see the metadata.
- Location data beyond what your IP address implies.
- Contact lists, calendar, microphone, or camera access outside the explicit Lookmaxxing capture flow.
- Behavioural-advertising trackers. We do not run third-party advertising pixels.

> **Founder decision needed:** confirm we are not running Meta Pixel, Google Analytics, TikTok Pixel, or similar on the landing / audit funnel. If we plan to add any for ad attribution before launch, this section must be updated, a cookie banner must be added, and the analytics section below must move from "first-party only" to a richer disclosure.

---

## Biometric data — face and scalp photos

This deserves its own section. Face and scalp images are the most sensitive data the product handles, and the prior draft did not give them the weight they deserve.

### What we treat as biometric

For the purposes of this policy we treat the following as **biometric and sensitive**, even where Indian law does not yet formally categorise them as such:

- **Face photos** — Aesthetic Audit front face, Aesthetic Audit side profile, daily mirror selfies.
- **Scalp photos** — front-of-scalp and crown-of-scalp photos from the weekly hair tracker.
- **Inferences computed from those photos** — the 8-axis aesthetic scores (skin clarity, jaw definition, eye area, hair density, posture, facial harmony, expression, body composition), the Norwood stage estimate, hair-density score, recession estimate in millimetres, and any Consultant observation derived from them.

### Where the photos live

- **Uploaded over HTTPS** from your browser to our server.
- **Stored in a private Cloudflare R2 bucket** with public read access disabled. R2 is a globally distributed object store with automatic region selection by Cloudflare; we do not pin a single region today.
- **Compressed to ~200–300 KB** before storage. EXIF metadata is stripped except for orientation.

> **Founder decision needed:** Cloudflare R2's automatic region selection means the bytes may sit on US, EU, or APAC edge nodes at Cloudflare's discretion. The DPDPA does not currently restrict transfers to specific countries (see "Cross-border data transfer" below), but a lawyer may recommend pinning the R2 jurisdiction (`location_hint: apac`) to keep photos within Asia-Pacific. Cost is unchanged; configuration is a one-time setting. Recommend pinning to APAC before launch — it is the more defensible posture.

### Who can view them

- **You**, via your own authenticated Lookmaxxing dashboard.
- **Google Gemini**, transiently, for the duration of each scoring call (see "Inference processing" below).
- **No staff member** of Digit Global Services routinely views customer photos. Photos do not appear in the admin panel. We do not use photos in marketing without separate, written, per-photo consent.

### Inference processing — Google Gemini (United States)

This is the part of the system that deserves the most attention.

Each face photo and each scalp photo is sent over HTTPS to the **Google Gemini API**, operated by Google LLC and served from **infrastructure located in the United States**. Gemini computes the 8-axis aesthetic scores, the Norwood / density / recession estimates, and a short observation. The score and observation are returned to us and stored in our Postgres database. **The photo bytes themselves transit Google's US infrastructure for the duration of the inference call.**

Google's API terms for Gemini state that data submitted via the paid Gemini API is not used to train Google's models and is retained only for the period reasonably required to deliver the response and for abuse-monitoring purposes. We rely on those terms. They may change; check Google's current API privacy policy linked in the "Third-party processors" table below.

### Photo retention schedule

| Photo type | Retention rule |
|---|---|
| **Aesthetic Audit baseline** (front face, side profile, full body) | Kept until you cancel your Lookmaxxing subscription. Deleted within 30 days of cancellation. |
| **Day-30 re-audit photos** | Kept until you cancel. Deleted within 30 days of cancellation. (Baseline + Day-30 are kept long-term because the side-by-side reveal is a core product moment.) |
| **Daily mirror selfies** | Rolling window — **only the last 7** are retained. Older mirrors are automatically deleted as new ones arrive. |
| **Weekly hair photos** | Rolling window — **only the last 4** are retained. Older hair photos are automatically deleted. |
| **All photos on erasure request** | Deleted within **30 days** of your erasure request (see "Your rights" below). |
| **All photos on cancellation** | Deleted within **30 days** of cancellation taking effect, irrespective of the rolling-window state. |

### Legal basis

We process biometric data on the basis of your **freely given, specific, informed, and unambiguous consent** (DPDPA Sec 6). You will be asked to consent at the start of the Aesthetic Audit, with a separate explicit acknowledgement that your photos are sent to Google Gemini in the US for scoring. You may withdraw consent at any time (Sec 6(4)); withdrawal stops further processing and triggers deletion within 30 days, and will end your ability to use Lookmaxxing because the product cannot function without the photos.

> **Founder decision needed:** the consent flow described above is spec'd in `product/draft-consent-flow-and-age-gate.md`. Frontend-agent ships the UI in a follow-up commit. Do not flip `PAYWALL_PUBLIC=true` for Lookmaxxing until the consent flow is live in production.

---

## Cross-border data transfer

Some of our processors operate from outside India. Specifically:

- **Google Gemini** — United States (biometric inference, text scoring).
- **Cloudflare R2** — global edge network, automatic region selection (photo storage).
- **Neon Postgres** — Singapore region (user, audit, event database).
- **Resend** — United States (transactional email, currently dormant).
- **Render** — United States (web hosting).

DPDPA **Section 16** allows cross-border transfer of personal data by default. The Central Government has the power to **restrict** transfers to specified countries by notification. **As of the date of this policy, no country has been notified for restriction under Section 16.** This means transfers to the US, Singapore, and Cloudflare's global edge are currently lawful under the DPDPA.

Older guidance under **IT Rules 2011 Rule 7** requires that any transfer of sensitive personal data outside India be either (a) necessary for performance of the contract with the data subject, or (b) consented to by the data subject. We rely on **both** — the transfer is necessary for the inference that delivers the product, and you consent explicitly at signup.

> **Founder decision needed:** if the Central Government issues a Section 16 restriction notification covering the US (a possibility, not a forecast), the Gemini inference path will need rerouting (e.g. to Gemini's EU region if available, or to an India-region inference provider). Worth flagging this risk to a lawyer and asking what re-architecture lead time would be reasonable. **For now, defensible posture is: explicit consent + necessity + this policy section.**

We will update this section if the Central Government issues a restriction notification that affects any of our processors.

---

## How long we keep your data

| Data | Retention |
|---|---|
| Account profile (name, phone, email) | While your account is active, plus 12 months after cancellation for re-onboarding and dispute resolution. Then deleted or anonymised. |
| Orator message replies + Gemini scores | While your account is active. On cancellation: deleted within 30 days unless you request export first. |
| Photos | Per the schedule in the "Biometric data" section above. |
| **KPI events** | Retained indefinitely in aggregated form for product analytics. Per-user event rows are deleted within 30 days of erasure request. Anonymous pre-signup events (keyed only to `mc_anon_id`) age out after 24 months. |
| **Web-push subscriptions** | Until you disable push notifications in the PWA or in your browser settings, or until cancellation. Stale subscriptions (push delivery failures) are pruned within 30 days. |
| **Consent records** | Retained for the duration of your account plus 7 years post-cancellation, as evidence of consent given. This is the minimum we believe defensible under the Limitation Act 1963; a lawyer should confirm. `[CONFIRM WITH LAWYER]` |
| Payment records | Retained for the minimum period required by Indian tax law — currently **8 years** under the Income Tax Act and CGST record-keeping rules. `[CONFIRM WITH CA]` We retain only metadata, never the payment instrument. |
| Server logs (IP, session timestamps) | 90 days, rolling. |

DPDP Rule 8 requires Data Fiduciaries to publish purpose-bound retention timelines and to delete data once the stated purpose is no longer served. The table above is our published schedule.

> **Founder decision needed:** the rolling-window photo retention (7 daily mirrors, 4 weekly hair) is set by the backend's storage logic. Confirm this matches what the production code does before publish — drift between policy and implementation is a compliance failure on its own.

---

## Third-party processors

Each is a Data Processor under the DPDPA and processes your data on our instructions, for the stated purpose only. We have or will have written processor agreements with each where the law requires one.

| Processor | What they handle for us | Where they sit | Privacy URL |
|---|---|---|---|
| **Google (Gemini API, Gemini Vision)** | Scores your text replies, voice transcripts, audit photos, mirror selfies, hair photos | United States | https://policies.google.com/privacy |
| **Razorpay** | Subscription creation, recurring billing, payment instrument handling, refunds | India | https://razorpay.com/privacy/ |
| **Meta (WhatsApp Cloud API)** | Delivery of WhatsApp messages from The Consultant to you, and your replies back to us. (Currently dormant until Meta WABA approval — listed here so the policy is accurate when the channel goes live.) | India / global | https://www.whatsapp.com/legal/privacy-policy |
| **Resend** | Transactional email — receipts, login recovery, evolution reports (currently dormant) | United States | https://resend.com/legal/privacy-policy |
| **Cloudflare (R2)** | Object storage for photos | Global edge | https://www.cloudflare.com/privacypolicy/ |
| **Neon (Postgres)** | Primary database — users, audits, events, consent records | Singapore | https://neon.tech/privacy-policy |
| **MSG91** | SMS / OTP delivery, fallback channel | India | https://msg91.com/privacy-policy |
| **Render** | Web hosting | United States | https://render.com/privacy |
| **(Web Push)** | Push notifications are delivered by your browser vendor's push service (Firebase Cloud Messaging for Chrome / Android; Apple Push Notification Service for Safari / iOS; Mozilla autopush for Firefox). We do not control these services; they operate per the browser vendor's own privacy policy. | Global | (varies by browser) |

We will not add a new processor without updating this list and, where the change is material, notifying you over WhatsApp and email at least 14 days before it takes effect.

---

## Analytics — KPI events

We capture lightweight first-party analytics inside the product to understand which surfaces work, where users drop off, and what to fix next. **No third-party analytics SDK runs on our pages.** No Meta Pixel, no Google Analytics, no TikTok Pixel. The KPI event stream is first-party only: events fire from your browser to our own backend, and rows land in our own Postgres `events` table.

**What we capture:** page views, audit lifecycle (start, photo upload, scoring complete, paywall reached), mirror / protocol / hair lifecycle, payment events.

**What we don't capture in event properties:** your name, phone number, email, photo bytes, photo URLs, or any content of your replies. Properties are limited to non-identifying metadata (e.g. "axis count: 8", "evidence tier: 1", "outcome: success").

**Pre-signup:** events are keyed to a randomly-generated `mc_anon_id` browser cookie. When you sign up, that anonymous ID is stitched to your account row so we can see the pre- and post-signup arc as a single funnel.

**Opt-out:** see "Cookies" section below for the analytics opt-out posture.

> **Founder decision needed (flagged in the consent-flow spec):** today, KPI events fire by default. A defensible DPDPA posture is to require **affirmative consent** for analytics events that go beyond what is strictly necessary to deliver the page the user requested. Recommend implementing an opt-in analytics toggle in the consent flow before launch — the consent-flow draft spec'es this.

---

## Cookies and local storage

We use the minimum that the product needs to function.

| Item | Type | Purpose | Essential? |
|---|---|---|---|
| `mc_anon_id` | Cookie, 24 months | Anonymous ID used to stitch pre-signup behaviour to your account when you sign up | Yes (essential — without this, your audit results cannot follow you to your paid account) |
| `mc_auth` (or equivalent JWT) | localStorage | Keeps you logged in to the PWA between sessions, expires per the auth token TTL | Yes (essential — required for logged-in product surfaces) |
| `mc_consent_v` | Cookie, 24 months | Records which version of this privacy policy you accepted | Yes (essential — required to honour the consent regime) |
| `mc_analytics_ok` | Cookie, 24 months | Records your analytics opt-in choice from the consent flow | Yes (essential — required to honour your analytics choice) |

We do not set third-party advertising cookies. We do not set tracking cookies that follow you across other sites.

> **Founder decision needed:** if any third-party SDK is added later (e.g. Sentry for error tracking, Cloudflare Web Analytics, or any ad pixel), this table must be updated and the cookie banner posture revisited. Sentry is on the deferred list — when it ships, add a row here for any cookie / fingerprint it sets.

---

## Children's data

**MainCharacter is for adults. We do not knowingly accept users under 18.**

The DPDPA defines a "child" as any individual under 18 (Section 2(f)). **Section 9** imposes the strictest regime in the entire Act on processing children's data: verifiable parental consent is required before any processing, no behavioural tracking of children is permitted, and no targeted advertising to children is permitted. **Rule 10 of the DPDP Rules 2025** clarifies "verifiable" — broadly, the Data Fiduciary must take reasonable steps to confirm the consenting person is in fact an adult who is the parent or lawful guardian, with Aadhaar-linked DigiLocker tokens named as the authoritative path.

Our position is therefore to **not process children's data at all**. The consent flow includes an explicit "I am 18 years or older" checkbox (separate from the privacy / terms acceptance), and the Aesthetic Audit will not proceed without it. If we discover at any point that a user is under 18, we will delete their account and all associated data within 7 days.

> **Founder decision needed — this is a real one and is the single highest-residual legal risk for Lookmaxxing.** Self-declaration ("tick the box, I'm 18+") is the industry norm for adult products in India today and is broadly considered defensible for low-risk consumer services. **Lookmaxxing is not low-risk** — it handles facial photos that sit in the most sensitive data category and runs biometric inference on them. A lawyer may reasonably recommend stronger age verification (DigiLocker-based age check, or an Aadhaar age service like Sandbox / Digio / Karza). Decision points for the founder + lawyer:
>
> 1. Is self-declaration enough for our risk profile, given biometric inference?
> 2. If not, do we add a DigiLocker age proof at signup (cost ~₹5–15 per verification, founder budget impact at 12,500 paid subs ≈ ₹62,500–₹187,500 one-time)?
> 3. At what user volume do we revisit?
> 4. If a 14-year-old uses an older sibling's phone and ticks the box, are we covered by the self-declaration? (Lawyer view: arguably yes for liability, but the reputational risk of biometric processing on a minor is severe and PR-fatal.)
>
> Recommended conservative posture: self-declaration at v1, DigiLocker age check at v2 (post-launch, post-first-100-paid-subs). Flag this for the lawyer review explicitly.

---

## Your rights under the DPDPA

The DPDPA gives you, as a Data Principal, the following rights. We honour all of them.

1. **Right to access** (Sec 11). You may ask us for a summary of the personal data we hold about you, the purposes for which we are processing it, and the identities of any processors with whom we have shared it. **Endpoint:** `GET /api/lookmax/me/data/export` returns a machine-readable export (JSON) of your account, audits, mirror scores, protocol days, hair readings, payment metadata, and consent records, with download URLs for your retained photos.
2. **Right to correction and erasure** (Sec 12). You may ask us to correct any inaccurate or outdated data, or to erase any data we no longer need to hold. **Endpoint:** `DELETE /api/lookmax/me/data` initiates account deletion. Photos are removed from R2 within 30 days; database rows are scrubbed within 30 days; event rows are scrubbed within 30 days. Payment metadata is retained per the tax-law schedule.
3. **Right to nominate** (Sec 13). You may nominate another individual to exercise your rights on your behalf in the event of your death or incapacity. Write to the Grievance Officer below to record a nomination.
4. **Right to withdraw consent** (Sec 6(4)). You may withdraw your consent at any time, by writing to the Grievance Officer or by triggering deletion via the endpoint above. Withdrawal does not affect the lawfulness of processing carried out before the withdrawal. Withdrawing consent will, in most cases, end your ability to use the product.
5. **Right of grievance redressal** (Sec 13). You may file a grievance with us using the contact below. If you are not satisfied, you may escalate to the **Data Protection Board of India** (constituted under Sec 18).

We will respond to a Sec 11 / Sec 12 / Sec 13 request **within 30 days**, or sooner if the Rules require it.

> **Founder decision needed:** the two endpoints above (`GET /api/lookmax/me/data/export` and `DELETE /api/lookmax/me/data`) are going live tonight per the production push. Privacy policy publication should be sequenced AFTER those endpoints are confirmed working end-to-end, otherwise the policy promises a mechanism we don't yet offer. Smoke-test both before flipping any policy-link on the landing footer.

---

## Grievance Officer

In accordance with Section 8(9) of the DPDPA and Rule 9 of the DPDP Rules 2025, we have designated a Grievance Officer responsible for addressing any complaints regarding the processing of your personal data.

- **Name:** `[FOUNDER TO FILL — name of the designated Grievance Officer; for a small operation this is typically the founder.]`
- **Email:** `[FOUNDER TO FILL — recommend a dedicated grievance@maincharacter.digitglobalservices.com alias rather than the shared digitglobal.org@gmail.com.]`
- **Postal address:** see "Who we are" above.

If your grievance is not resolved to your satisfaction within 30 days, you may approach the **Data Protection Board of India** (constituted under Sec 18 of the DPDPA).

> **Founder decision needed:** designate the Grievance Officer by name. For a sole-founder operation this is almost always the founder. If MainCharacter is ever classified by the Central Government as a "Significant Data Fiduciary" under Section 10 (based on volume of data, sensitivity, risk profile, or impact on sovereignty / public order), a separate **Data Protection Officer** must be appointed and that DPO must be based in India. Biometric processing pushes us towards the upper end of the sensitivity scale — flag for revisit at 50,000 users.

---

## Security

We protect your data with industry-standard safeguards:

- HTTPS everywhere.
- Server-side payment signature verification on every Razorpay webhook event.
- Bcrypt-hashed admin credentials, JWT session tokens with TTL, rate-limited authentication endpoints.
- Private (non-public) Cloudflare R2 bucket for photos. Signed URLs for browser display, scoped to the authenticated user.
- Postgres database with row-level access keyed to authenticated session.
- Structured access logging.
- Prompt-injection guards on user-supplied content sent to Gemini (delimiters + explicit instruction).

We are obliged under **Rule 7 of the DPDP Rules 2025** to notify both you and the Data Protection Board of any personal-data breach **without delay**, and in any case within **72 hours** of becoming aware of it. Our incident-response process is built around that obligation.

> **Founder decision needed:** the 72-hour clock starts when we *become aware*, not when a breach is *confirmed*. We need a simple internal protocol — a Sentry alert (Sentry is on the deferred infra list — provision before launch), a phone-tree, a 30-minute initial triage, then a notification template ready to go. This is operational, not policy, but it lives or dies in advance. `[CONFIRM EXACT WORDING WITH LAWYER]`

---

## Comp / staff accounts

A small number of accounts (founder, internal testers, future invited users) hold paid subscription status without going through a Razorpay charge. We disclose this for transparency. Comp accounts are subject to the same data-handling and retention rules as paid accounts.

---

## Changes to this policy

We will update this policy when our practices change. The "Last updated" date and "Policy version" at the top reflect the most recent change. If a change is material — for example, a new processor, a new data category, a change in retention, or a change in the cross-border transfer posture — we will notify you over WhatsApp and email **at least 14 days before it takes effect** and, where appropriate, prompt you to re-consent in the product before continuing.

**Re-consent triggers** include: addition of a new processor that handles your data; expansion of biometric processing categories; change in retention schedule that extends storage; any Central Government Sec 16 restriction notification that requires us to change cross-border processing.

---

## Contact

To exercise any right, raise a grievance, or ask a question about this policy:

- **Email (Grievance Officer):** `[FOUNDER TO FILL]`
- **Postal address:** see "Who we are" above.

---

## References

- **Digital Personal Data Protection Act, 2023** — full text at https://www.meity.gov.in (search for "Digital Personal Data Protection Act 2023").
- **DPDP Rules 2025** — notified 13 Nov 2025; 18-month phase-in to ~mid-May 2027. Key rules cited: Rule 7 (breach notification), Rule 8 (retention), Rule 9 (Grievance Officer), Rule 10 (verifiable parental consent).
- **Information Technology Act, 2000** — Sec 43A (compensation for failure to protect sensitive personal data), Sec 72A (punishment for unauthorised disclosure).
- **IT (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011** — particularly Rule 5 (consent for collection) and Rule 7 (cross-border transfer of SPDI).
- **Consumer Protection (E-Commerce) Rules, 2020** — Rule 5 (disclosure obligations of e-commerce entities).

---

> **End of draft.** This is a starting point. Before this page ships on the live site, it must be reviewed by an Indian privacy / IT lawyer with DPDPA experience. Budget INR 25,000 – 60,000 for a thorough joint review of Privacy + Consent Flow + Terms + Refund by a competent solo practitioner or small firm; INR 1,00,000 – 2,00,000 for a Tier-1 firm. Worth the spend; do not skip. The biometric-data section and the Section 16 cross-border posture are the two highest-leverage paragraphs for a lawyer to pressure-test.
