# Terms of Service — DRAFT

> **DRAFT — requires lawyer review.** Not yet shipped. Author is the legal-finance-agent and is **not a lawyer**. This is a starting point for a real Indian commercial / consumer lawyer to refine before it goes live. Drafted against the **Indian Contract Act 1872**, the **Consumer Protection Act 2019** and the **Consumer Protection (E-Commerce) Rules 2020**, current Razorpay merchant requirements (which require a published Terms, Refund Policy, Privacy Policy and Contact page before approving live KYC), the **Information Technology Act 2000**, and the **DPDPA 2023** for the data clauses. Sources cited at the bottom.
>
> **Voice note for the founder:** drafted in restrained, plain English. Not contract-corporate. A Terms page is for the user to actually read; if it reads like Citibank's, no one will. Where a clause needs the protective language of a contract, it gets it — but the default is short sentences and direct claims. The copy-consultant-agent can sand the headlines later once a lawyer has signed the substance.
>
> **Material change vs prior draft (28 May 2026):** rewritten to cover production-state — Lookmaxxing PWA with R2 photo storage, Gemini biometric inference, Razorpay Subscriptions (not one-shot links), comp accounts, DPDPA Sec 11/13 data-rights endpoints, the explicit no-medical-advice disclaimer that the prior draft had buried, and IP framing for reveal artefacts. Refund detail moved into its own document (`product/draft-refund-policy.md`) and cross-referenced here.
>
> **Last updated placeholder:** `[DATE — to be set on publish]`

---

## 1. Who you are agreeing with

These Terms govern your use of MainCharacter, a personal-growth product operated by **Digit Global Services** ("we", "us"). MainCharacter is delivered at `https://maincharacter.digitglobalservices.com`, through the Lookmaxxing Progressive Web App (PWA), and through WhatsApp messages from the verified business number `+91 99585 33994` (channel currently dormant pending Meta WABA approval).

- **Legal name:** `[FOUNDER TO FILL — e.g. Digit Global Services LLP / Pvt Ltd / sole proprietorship.]`
- **Registered office:** `[FOUNDER TO FILL — the absence of this address is the single blocker for all four legal documents and is flagged once per document.]`

By creating an account, paying for a subscription, accepting the consent flow at the start of the Aesthetic Audit, or otherwise using MainCharacter, you confirm you have read these Terms and the Privacy Policy and agree to them. If you do not agree, do not use the product.

> **Founder decision needed:** confirm the exact registered entity name and registered office address. These must appear here verbatim and must match Razorpay's KYC records and the entity name on the bank account that receives Razorpay settlements.

---

## 2. What MainCharacter is

MainCharacter is a personal-growth product with two paid pillars:

- **Lookmaxxing** — a web app (PWA) focused on physical presence. A free **Aesthetic Audit** is the entry point. The paid subscription unlocks the daily mirror, the personalised daily protocol, the weekly hair tracker, the weekly reveal, and the Day-30 re-audit. Scoring is performed by Google Gemini (see Privacy Policy for the cross-border data transfer disclosure).
- **The Orator** — a daily protocol delivered over WhatsApp, focused on speech, voice and communication. A 7-day free protocol introduces the work. At the end of Day 7, we offer a paid subscription. (WhatsApp channel currently dormant pending Meta WABA approval — until live, Orator enrolment is not available to the public.)
- **Aura++** is the combined status when you hold both subscriptions. Bundle pricing applies automatically at checkout when you select both.

### Not medical advice

The product is a guidance and education tool. **It is not medical advice, dermatological advice, trichological advice, psychiatric advice or speech therapy.** Recommendations regarding skin, hair, facial structure, posture, voice, or any other domain are general in nature and are **not** a substitute for consultation with a qualified medical professional. The 8-axis aesthetic scores, Norwood-stage estimates, hair-density estimates and recession measurements produced by our AI scoring are diagnostic indicators only, not measurements with clinical precision, and must not be relied on for any medical decision. **If you have a medical condition, or believe you might, consult a doctor before acting on anything we suggest.**

### Not a guarantee of outcome

We do not guarantee any specific outcome — no specific score, no specific aesthetic change, no specific level of personal growth. Personal-growth products produce results only with engagement; we cannot underwrite engagement, biology, or your circumstances.

---

## 3. Eligibility and the 18+ requirement

You must be **at least 18 years of age** to use MainCharacter. You will be asked to confirm this explicitly in the consent flow before the Aesthetic Audit collects any photos. **Misrepresenting your age is a breach of these Terms** and gives us the right to terminate your account immediately and delete all associated data.

The product collects and processes face and scalp photos — these are sensitive data, and we do not process them for minors under any circumstances. See the Privacy Policy "Children's data" section for the full position and the Data Fiduciary obligation under DPDPA Sec 9.

---

## 4. Account, authentication and security

You access your account using your phone number as the primary identifier (with an OTP login for verification once the WhatsApp channel is live). Until then, the PWA uses an admin-bypass login for invited testers only.

You are responsible for keeping your phone, your device and your authentication credentials secure. Tell us as soon as you suspect unauthorised access — write to the Grievance Officer email listed in the Privacy Policy and on the Contact page.

We may suspend access without notice if we detect or reasonably suspect unauthorised use, fraud, or abuse.

---

## 5. Pricing, billing, and currency

| Plan | Price | Cycle |
|---|---|---|
| The Orator | ₹799 | per month, recurring |
| Lookmaxxing | ₹1,499 | per month, recurring |
| Aura++ (both pillars) | ₹1,999 | per month, recurring (saves ₹299 vs both pillars separately) |

All prices are in **Indian Rupees (INR)** and are charged via **Razorpay Subscriptions**. These are recurring subscription mandates, not one-shot payment links — by subscribing you authorise Razorpay (acting on our behalf) to charge your nominated payment instrument on each billing cycle until you cancel.

Razorpay handles all payment instrument data on its own infrastructure. We never see your card number, CVV, or UPI PIN. We see only the subscription metadata (subscription ID, plan, billing dates, charge status).

### GST

> **Founder decision needed — and read this paragraph carefully:** GST registration in India is mandatory for service providers once aggregate annual turnover crosses **₹20 lakh** in most states (₹10 lakh in special category states). MainCharacter is a digital service taxable at **18% GST**. At our current MRR, we may be below the threshold and not yet registered. Three things flow from this:
>
> 1. Until we are registered, we cannot charge GST and cannot issue a tax invoice with a GSTIN. Receipts will read "GST not applicable — supplier below registration threshold" or similar. `[CONFIRM EXACT WORDING WITH CA.]`
> 2. The threshold is a rolling annual figure. At ₹799 ARPU, we cross ₹20 lakh at roughly 2,500 customer-months / year. The product is designed to scale past that quickly. Founder must register **before** the threshold is crossed, not after, to avoid having to back-collect.
> 3. Once registered, pricing decision: do we hold the ₹799 / ₹1,499 / ₹1,999 prices and absorb the 18% GST from our margin, or do we make them GST-exclusive and charge ₹942.82 / ₹1,768.82 / ₹2,358.82?
>
> Action: get a CA on retainer (typical small-CA monthly retainer in India runs INR 3,000 – 10,000 for early-stage SaaS). Have them set up GST registration before the threshold is crossed and advise on the absorb-vs-pass decision. **This Terms page does not assert a GST status — that is open and a CA decision.**

Until GST registration is in place, the receipt and this section should read: **"Prices listed are inclusive of all applicable taxes. Digit Global Services is currently below the GST registration threshold and does not charge GST. Tax treatment will be updated when registration is completed and you will be notified at least 14 days before any change to your billing."** `[CONFIRM EXACT WORDING WITH CA.]`

### Renewals and price changes

Subscriptions renew automatically each month on the same date as your first charge, until you cancel. We will not change the price during your active billing cycle. If we change the price for a future cycle, we will notify you over WhatsApp and email **at least 14 days before** the change applies and you may cancel before the next billing date if you do not accept the new price.

### Comp accounts

A small number of accounts (founder, internal testers, future invited users) hold paid subscription status without going through a Razorpay charge. The same Terms apply to comp accounts as to paid accounts.

---

## 6. Free trials and free entry points

**The Aesthetic Audit is free.** A single-session diagnostic; no payment instrument collected. After the audit, you may choose to subscribe to Lookmaxxing or Aura++.

**The Orator includes a 7-day free protocol.** No payment instrument is collected during the trial. At the end of Day 7 you receive an Evolution Report and a single offer to continue as a paid subscriber. If you do not subscribe, the protocol ends.

---

## 7. Cancellation

You may cancel any subscription at any time. We aim to make cancellation **at least as easy as subscribing**, in keeping with current RBI guidance on recurring digital payments and the spirit of the Consumer Protection (E-Commerce) Rules 2020.

How to cancel:

1. From your Lookmaxxing PWA, the "Manage subscription" link in your account settings (`/lookmax/me`).
2. From your Razorpay subscription management link (the link in your subscription confirmation email).
3. By WhatsApp, by replying `CANCEL` to The Consultant (once the WhatsApp channel is live).
4. By email, to the address on the Contact page.

When you cancel:

- Your subscription remains active until the **end of the current billing cycle** for which you have already paid. You will not be charged again.
- After the cycle ends, paid features stop. Your account and data are retained per the Privacy Policy retention schedule (in particular, photos are deleted within 30 days of cancellation taking effect).

Cancellation **does not** trigger an automatic refund of the current cycle. See the separate Refund Policy (`/refund`) for refund eligibility.

> **Founder decision needed:** route 3 (WhatsApp `CANCEL`) is dependent on the WhatsApp Cloud API going live. Until then either (a) implement WhatsApp CANCEL handling before publishing this clause, (b) drop route 3 from the published Terms, or (c) keep it but mark it "Coming soon — once the WhatsApp channel is live." Recommend (c) so the Terms reflect the steady-state architecture and we don't churn the document twice.

---

## 8. Refunds

Refund eligibility, the request mechanism, and the processing timeline are governed by our separate **Refund Policy**, available at `https://maincharacter.digitglobalservices.com/refund` and incorporated into these Terms by reference. Read it carefully before you subscribe.

In summary: a 7-day no-questions refund window applies from your first charge; after that, refunds are limited to specific cases (duplicate charges, service failure on our side, unauthorised charges). Cancellation does not auto-refund the current cycle. Full text in the Refund Policy.

---

## 9. Acceptable use

You agree not to:

- Use MainCharacter to send abusive, hateful, harassing, defamatory, sexually explicit, or unlawful content as your daily replies.
- Impersonate any other person, including by using another person's phone number, email, or photographs.
- **Upload photographs that are not of yourself**, or that contain any other identifiable person without their consent, or any person under 18. This rule exists because Lookmaxxing performs biometric inference on every photo; uploading a third party's face without their consent is both a breach of these Terms and likely a violation of Indian privacy law on their behalf.
- Attempt to reverse-engineer, scrape, or circumvent the technical protections of the product, including the rate limits, signed photo URLs, and authentication tokens.
- Use automated tools, bots, or scripts to interact with the product, beyond what the published API explicitly permits.
- Resell, sub-licence, or share access to your account, including comp accounts.

We may suspend or terminate your account, with or without notice, for serious or repeated violations of this section. We may also refer unlawful conduct to law enforcement.

---

## 10. Your content, our content

### Your content (the user-generated material)

The text replies, voice notes, and **face and scalp photos** you submit remain **yours**. You retain ownership and all underlying rights, including the 8-axis aesthetic scores, Norwood / density / recession estimates, and other inferences produced from your photos — those scores are your data even though they were computed by our system.

You grant us a **limited, non-exclusive, royalty-free, worldwide licence** to process this content **for the sole purpose of delivering the product to you**: scoring it, generating your reports, storing it for the retention periods stated in the Privacy Policy, and transmitting it to the third-party processors disclosed in the Privacy Policy (in particular, Google Gemini for inference). We do not claim ownership of your content and we do not use your content for any other purpose without your separate, explicit, written consent.

**We will not use your photographs in marketing materials without separate written consent, on a per-photo basis.** This is firm.

### Our content

The daily protocols, vocabulary words, scoring frameworks, prompt templates, The Consultant persona and voice, the rank systems (Unawakened → Sovereign for Orator; Raw → Sovereign for Lookmaxxing Mirror Levels), the audit funnel design, the visual brand, the ◆ MainCharacter mark, the landing-page copy, and all source code are the **intellectual property of Digit Global Services**. You may not republish, resell, or adapt our content beyond your own personal use.

### Shared / derived artefacts (weekly reveal, side-by-side, hair trajectory)

When you choose to **share** a reveal artefact from the product (for example, the weekly reveal slideshow, the Day-30 side-by-side, or the hair-density trajectory), the rendered artefact (the canvas image, the future MP4) is generated by our system using our visual brand (the gold trajectory line, the ◆ signature, the typographic treatment). For those rendered artefacts:

- The **underlying photos** remain yours.
- The **rendering** (the trajectory line, the brand frame, the typographic treatment, the ◆ mark) is ours.
- By choosing to share the rendered artefact, you grant us a non-exclusive licence to display that artefact in product galleries and (separately consented) marketing materials. **No automatic licence is granted for marketing use** — sharing the artefact privately or to your own social accounts does not give us marketing rights.

---

## 11. Data protection

Our handling of your personal data — what we collect, what we do with it, where it goes, how long we keep it, and your rights — is set out in full in the Privacy Policy at `https://maincharacter.digitglobalservices.com/privacy`. By using the product you acknowledge you have read it.

The key data-protection promises that sit at the Terms layer:

- We process biometric data (face and scalp photos and inferences derived from them) only with your explicit consent.
- We transmit photos to Google Gemini in the United States for scoring — this cross-border transfer is disclosed in the Privacy Policy and you consent to it explicitly in the consent flow.
- You have the rights granted by the DPDPA — access (Sec 11), correction and erasure (Sec 12), nomination (Sec 13), withdrawal of consent (Sec 6(4)), and grievance redressal (Sec 13). The exercise mechanisms are listed in the Privacy Policy. The two endpoints are `GET /api/lookmax/me/data/export` (export) and `DELETE /api/lookmax/me/data` (erasure).
- We will notify you over WhatsApp and email of any personal-data breach affecting your data without delay and in any case within the 72-hour window required by Rule 7 of the DPDP Rules 2025.

---

## 12. Limitation of liability

To the maximum extent permitted under Indian law, our **total liability** to you in connection with the product, in any 12-month period, will not exceed the **total amount you have paid us for that period**.

We are not liable for indirect, consequential, or incidental loss, including loss of profits, business, reputation, or data, arising out of your use of the product.

Nothing in these Terms limits any liability that cannot lawfully be limited under Indian law, including liability for fraud, gross negligence, or for any breach of duties that cannot be excluded under the Consumer Protection Act 2019.

> **Founder decision needed:** the "12-month fees paid" cap is broadly enforceable in India for digital consumer services, but a lawyer may want to tighten the carve-outs — particularly around how the Consumer Protection Act 2019 treats unfair contract terms (Sec 2(46) and Schedule). Worth a 30-minute lawyer call specifically on this clause and on Clause 10's licence grant for shared artefacts.

---

## 13. Disclaimers

The product is provided **on an "as is" and "as available" basis**. We do not warrant uninterrupted availability. We rely on third-party infrastructure (Meta WhatsApp Cloud API, Razorpay, Google Gemini, Cloudflare R2, Neon Postgres, Render) and any of these can fail. When they do, we work to restore service as quickly as we can. Extended outages may be eligible for service-credit or pro-rata refund — see Refund Policy.

AI-generated scores and observations are **diagnostic indicators**, not measurements with clinical precision. Face and scalp inferences in particular are derived from a single photograph at a single moment under variable lighting; treat them as signal, not verdict.

---

## 14. Termination

You may terminate your relationship with us at any time by cancelling all active subscriptions and asking us to delete your account (via `DELETE /api/lookmax/me/data` or by writing to the Grievance Officer).

We may terminate your account:

- For material breach of these Terms (in particular Section 9, Acceptable Use, and Section 3, the 18+ requirement).
- For non-payment of a subscription cycle after the standard Razorpay retry period.
- If we are required to do so by law, court order, or regulator direction.
- If we decide to discontinue the product (in which case we will give you reasonable advance notice — at least 30 days — and refund any pre-paid period not delivered).

Where reasonable, we will give notice and a chance to fix the issue before terminating.

On termination, the licence we have to process your content ends and we delete your data per the retention schedule in the Privacy Policy.

---

## 15. Changes to these Terms

We will update these Terms when our product or practices change. The "Last updated" date at the top of this document reflects the most recent change. If a change is material — for example, a change in pricing, refund policy, the limitation of liability, or the scope of data processing — we will notify you at least **14 days before** it takes effect, over WhatsApp and email. Your continued use of the product after the effective date constitutes acceptance.

For changes that materially affect the consent on which we process your data (new processor, expanded data category), we will additionally prompt you to re-consent in the product before continuing — see the Consent Flow draft for the re-consent mechanism.

---

## 16. Governing law and dispute resolution

These Terms are governed by the **laws of India**. Any dispute arising out of or in connection with these Terms or your use of the product will be subject to the **exclusive jurisdiction of the courts at `[CITY — to be set based on the registered office of Digit Global Services]`, India**.

Before approaching the courts, you agree to first raise the dispute with us in writing at the Grievance Officer email and give us **30 days** to attempt resolution. For DPDPA grievances specifically, the Grievance Officer route and onward escalation to the Data Protection Board of India is the prescribed path — see Privacy Policy Section "Grievance Officer".

> **Founder decision needed:** the jurisdiction clause must point at the courts of the city where Digit Global Services is registered (or where the founder is physically based, if different). Picking a jurisdiction that is not your registered office can create enforceability problems. **Recommended default: the city of the registered office.**

---

## 17. Contact

For any question about these Terms, see the Contact page at `/contact` or write to the email listed there. For data-protection grievances, the dedicated route is in the Privacy Policy.

---

## References

- **Indian Contract Act 1872** — particularly Sec 10 (lawful agreement), Sec 23 (unlawful consideration), Sec 73 (compensation for breach).
- **Consumer Protection Act 2019** — particularly Sec 2(7) (consumer), Sec 2(46) (unfair contract), Schedule (unfair terms list).
- **Consumer Protection (E-Commerce) Rules 2020** — Rule 5 (disclosure obligations of e-commerce entities), Rule 6 (general duties of marketplace e-commerce entities — relevant on cross-reference even though we are an inventory model).
- **Information Technology Act 2000** — Sec 43A, Sec 72A.
- **Digital Personal Data Protection Act 2023** — full cross-reference in the Privacy Policy.
- **DPDP Rules 2025** — Rules 7, 8, 9, 10.
- **RBI guidance on recurring transactions** — RBI's framework on e-mandates for recurring payments (most recent circular relevant to AFA, additional factor authentication, and the requirement that cancellation is at least as easy as initiation).

---

> **End of draft.** Same caveats as the Privacy Policy: this is a starting point. Before this page ships on the live site, it must be reviewed by an Indian consumer / commercial lawyer. Recommend a single joint review (Privacy + Terms + Refund + Consent Flow) — most competent solo practitioners will charge INR 25,000 – 60,000 for the bundle; INR 1,00,000 – 2,00,000 at a Tier-1 firm. Razorpay live KYC will check that these pages exist and look serious; a lawyer review also defends the brand if any consumer complaint ever escalates.
