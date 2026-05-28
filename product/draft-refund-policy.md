# Refund Policy — DRAFT

> **DRAFT — requires lawyer review.** Not yet shipped. Author is the legal-finance-agent and is **not a lawyer**. This is a starting point for a real Indian consumer / commercial lawyer to refine before it goes live. Drafted against Razorpay's published merchant requirements, the **Consumer Protection Act 2019**, the **Consumer Protection (E-Commerce) Rules 2020** (in particular Rule 5 on disclosure obligations), the **Information Technology Act 2000**, and the **Reserve Bank of India** framework for recurring digital subscriptions. Sources cited at the bottom.
>
> **Voice note for the founder:** restrained, plain English. A refund policy is the document the angriest user reads — write it as if the reader is upset, in a hurry, and looking for specifics, not warmth. Drafted accordingly.
>
> **Why this is a separate document:** the prior Terms of Service draft had refund detail inline. Splitting it out (a) matches Razorpay merchant convention (separate `/refund` URL), (b) lets the Terms link to it cleanly, (c) lets us update refund mechanics without re-shipping Terms, and (d) is what Rule 5 of the Consumer Protection (E-Commerce) Rules 2020 effectively expects — refund mechanism disclosed clearly and accessibly.
>
> **Last updated placeholder:** `[DATE — to be set on publish]`

---

## 1. Who this applies to

This Refund Policy applies to anyone who pays for a MainCharacter subscription — **The Orator (₹799/mo)**, **Lookmaxxing (₹1,499/mo)**, or the **Aura++ bundle (₹1,999/mo)** — through our Razorpay checkout. Comp accounts (founder and invited testers, who hold paid status without a charge) are not eligible for refunds because no charge was made.

The legal entity refunding you is **Digit Global Services**, the operator of MainCharacter. Refunds are processed through Razorpay back to the same payment instrument you used to subscribe; we cannot redirect a refund to a different card, UPI ID, or bank account.

- **Legal name:** `[FOUNDER TO FILL — see Privacy Policy / Terms for the legal entity name to use verbatim.]`
- **Registered office:** `[FOUNDER TO FILL — postal address gap flagged once per document; resolution required before this page ships.]`

---

## 2. The 7-day no-questions refund window

If you subscribed for the first time and decide within **7 calendar days of your first charge** that the product is not for you, we will refund that **first charge in full**, no questions asked.

- The 7-day clock starts at the timestamp of your first successful Razorpay charge (the `subscription.activated` event, in our terms).
- The window applies once per customer per pillar. It applies to your first subscription to The Orator, your first subscription to Lookmaxxing, and your first subscription to Aura++, considered separately.
- To use the 7-day window, write to the refund email in Section 6 below within 7 days of the charge. Subject line: `Refund within 7 days — [subscription ID]`. Include the Razorpay subscription ID from your receipt.
- Once we receive a complete request, we will initiate the refund through Razorpay within **2 working days**. Razorpay's standard refund settlement timeline (the time between us initiating and the money landing back on your card / UPI / bank) is **5–7 working days** for most payment instruments; some banks take longer. The total round-trip is therefore typically **5–9 working days** from the day you write to us.
- When the refund is initiated, your subscription is **cancelled at the end of the current cycle** — service continues until then unless you ask us to stop it sooner.

> **Founder decision needed:** the 7-day window is a deliberate trust-building choice. Razorpay merchant guidance does not mandate a no-questions window; this is an industry-norm consumer-protection move. **It does mean that a fraction of paying users will use the window to dip in, try the product, and refund — accept this as a marketing cost.** Defensible if the conversion lift from "7-day money-back" copy in the paywall outweighs the refund cost; tighten or widen post-launch based on data.

---

## 3. Refunds after the 7-day window

After day 7 of your first charge, refunds are limited to the following specific cases:

### 3.1 Duplicate charge

If you are billed twice for the same cycle due to a payment-gateway error on our side, we will refund the duplicate in full within **5 working days** of you raising it, and earlier where possible.

### 3.2 Failure of service on our side

If we are unable to deliver the product for a material period during a paid cycle, we will, at our discretion, either credit the next cycle or refund pro-rata for the unavailability. "Material" means **more than 72 cumulative hours of outage** in a single billing cycle that prevent you from using the core features (Lookmaxxing PWA, daily mirror, daily protocol, weekly hair, weekly reveal, Day-30 re-audit; or Orator daily messages once that channel is live).

Failures on third-party infrastructure (Razorpay, Meta WhatsApp, Google Gemini, Cloudflare, Render) that affect us also affect our other customers and are still our responsibility; the same 72-hour threshold applies.

### 3.3 Unauthorised charge

If your payment instrument was used to subscribe to MainCharacter without your authorisation:

- Raise it with us immediately at the refund email below. We will pause the subscription, refund the **most recent cycle** pending verification, and conduct a brief review.
- If our review confirms the charge was unauthorised, we will refund all charges associated with the unauthorised use, subject to Razorpay's chargeback processes and the time limits imposed by your card issuer.
- We may also direct you to your card issuer or bank for a chargeback through their own dispute mechanism, particularly where multiple cycles have been charged.

### 3.4 Material change in service we cannot back-out

If we materially change the product in a way that removes a feature you were specifically subscribed for, and we cannot offer a substitute, we will refund pro-rata for the remainder of the paid cycle. (This is a rare case; we flag price changes 14 days in advance and you can cancel before the change applies — see Terms Section 5.)

---

## 4. What is not refundable

We do not refund:

- Cycles already delivered or cycles in progress beyond the 7-day window above, for any reason other than those in Section 3.
- Cycles where you chose not to engage with the product. The daily mirror, the protocol, the weekly hair reading, and the Day-30 re-audit are available the moment your cycle begins; we cannot underwrite engagement.
- Cycles where you cancelled mid-cycle — see Section 5 below.
- Charges arising from your own change-of-mind after the 7-day window.
- Charges arising from your subscription continuing because you forgot to cancel. Razorpay sends cycle reminders; we send onboarding messages. Auto-renewal is the default and is disclosed in the Terms.
- Charges to a comp account (no charge was made).

This list is not exhaustive — it illustrates the spirit of the policy. The default position outside the cases in Sections 2 and 3 is no refund.

---

## 5. Cancellation is not a refund

Cancelling your subscription does **not** automatically refund the current cycle. The Razorpay subscription model bills in advance for each monthly cycle, and the entire month's content (daily protocols, scoring, weekly reveals, the Day-30 re-audit) is available to you the moment the cycle begins.

When you cancel:

- Your subscription remains active until the **end of the current billing cycle** for which you have already paid.
- You will not be charged again.
- Photos and data are retained per the Privacy Policy retention schedule (in particular, photos are deleted within 30 days of cancellation taking effect).
- If you cancel within the 7-day window described in Section 2 and want the first charge refunded, you must say so explicitly in the cancellation message — cancellation alone is not a refund request.

How to cancel is detailed in Terms Section 7.

---

## 6. How to request a refund

By email, to the refund address:

- **Email:** `[FOUNDER TO FILL — recommended: refund@maincharacter.digitglobalservices.com, with forwarding to the founder inbox.]`

By dashboard / endpoint (planned, not yet live for refund-specific flow):

- Inside the Lookmaxxing PWA, "Manage subscription" → "Request refund" will open a pre-filled email to the address above. (Frontend-agent ships this once the address is set up.)

Include in your message:

1. Your Razorpay subscription ID (visible on your receipt and on the payment-confirmed page).
2. The phone number associated with your account.
3. Which charge you are asking us to refund (date or cycle).
4. Which case from Sections 2 or 3 applies, in your understanding (we will tell you if we disagree).

We will acknowledge your request within **2 working days** and tell you (a) whether it is eligible, (b) what we will refund, and (c) when you can expect the money back.

> **Founder decision needed:** set up the `refund@maincharacter.digitglobalservices.com` alias before this page ships. Recommend a forwarding alias to the founder inbox during early-stage operation; transition to a dedicated inbox once a support person is hired. This pairs with the `support@` and `grievance@` aliases flagged in the Contact page draft.

---

## 7. Timeline for processing

| Stage | Time |
|---|---|
| We acknowledge your refund request | Within **2 working days** of you writing to us |
| We initiate the refund via Razorpay (once eligibility is confirmed) | Within **2 working days** of acknowledgement |
| Razorpay processes the refund back to your payment instrument | **5–7 working days** for most cards / UPI; longer for some banks |
| **Total round-trip (typical)** | **5–9 working days** from the day you write to us |

We do not control Razorpay's processing time. If a refund is initiated and the money has not landed in 10 working days, write to us with the Razorpay refund ID we sent you and we will chase it.

---

## 8. Disputes about a refund decision

If you disagree with our refund decision:

1. Write back to the refund email with the reason. We will re-review and respond within **5 working days**.
2. If you are still not satisfied, you may escalate to the Grievance Officer listed in the Privacy Policy.
3. You retain your statutory rights under the **Consumer Protection Act 2019**, including the right to approach a Consumer Disputes Redressal Commission. For digital subscriptions under ₹50 lakh in claim value, the **District Commission** has jurisdiction in the first instance. The Commission can be approached either at the place of the consumer's residence or where the cause of action arose.
4. For data-protection grievances (separate from refund disputes), the DPDPA path through the Grievance Officer and onward to the Data Protection Board applies — see Privacy Policy.

We hope it never reaches this point. The refund policy is written to be honoured.

---

## 9. Currency, taxes, and refund mechanics

- Refunds are issued in **Indian Rupees (INR)** to the same payment instrument used to subscribe. We cannot refund to a different card, UPI ID, or bank account.
- If GST was charged on the original subscription (i.e. after Digit Global Services becomes GST-registered — currently the GST registration status is open, see Terms Section 5), the GST component is refunded along with the principal where the underlying charge is refunded. `[CONFIRM WITH CA.]`
- Currency conversion losses for international cards (if the user's card was billed in a non-INR currency that Razorpay then converted) are not our responsibility and we cannot refund them — the exchange rate at the time of original charge differs from the rate at refund. This is a limitation of cross-currency refunds, not a policy choice.

> **Founder decision needed:** the international-card disclosure becomes more important when paid acquisition reaches users with non-INR cards (NRIs paying for parents / siblings in India, or any expansion). For India-launch v1 with INR-only pricing and India-issued cards as the dominant case, the language above is sufficient.

---

## 10. Changes to this policy

We may update this Refund Policy when our practices change. The "Last updated" date at the top reflects the most recent change. Material changes will be notified to active subscribers over WhatsApp and email at least **14 days before** they take effect. The version that applied at the time of your charge governs that charge — we will not retroactively narrow refund rights on a charge you have already paid.

---

## 11. Contact

To request a refund or ask a question about this policy:

- **Email (refund requests):** `[FOUNDER TO FILL — refund@…]`
- **Email (Grievance Officer, for disputes):** see Privacy Policy.
- **Postal address:** see Privacy Policy.

---

## References

- **Consumer Protection Act 2019** — Sec 2(7) (consumer), Sec 35 (jurisdiction of District Commission), Sec 38 (procedure on admission of complaint), Sec 39 (findings).
- **Consumer Protection (E-Commerce) Rules 2020** — Rule 5 (disclosure obligations, including the requirement to publish a clear and accessible refund mechanism).
- **Information Technology Act 2000** — Sec 43A (compensation for failure to protect data), Sec 79 (intermediary safe-harbour — relevant on cross-reference even though we are not a marketplace).
- **RBI framework on recurring digital payments** — RBI circular on e-mandates and additional factor authentication; cancellation must be at least as easy as subscription.
- **Razorpay merchant guidance** — Razorpay's published refund and dispute procedure for subscription merchants. See Razorpay's merchant documentation at razorpay.com.

---

> **End of draft.** Short document but the one paid users read when something goes wrong; clarity matters more than length. Bundle this with the Privacy, Terms, and Consent Flow drafts for a single joint lawyer review (combined budget INR 25,000 – 60,000 for a solo practitioner; 1,00,000 – 2,00,000 at a Tier-1 firm). The two clauses most worth pressure-testing are Section 2 (the 7-day window — is it framed in a way that survives a Consumer Disputes Redressal Commission complaint?) and Section 3.2 (the 72-hour outage threshold — is it enforceable, and does the discretion clause survive Sec 2(46) of the Consumer Protection Act 2019 on unfair terms?).
