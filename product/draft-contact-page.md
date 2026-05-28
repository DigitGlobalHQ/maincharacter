# Contact Page — DRAFT

> **DRAFT for founder review.** Not yet shipped. Author is not a lawyer. Razorpay's published merchant requirements expect a Contact page with a working email, phone number, **and** a physical postal address. Indian consumer law (Consumer Protection (E-Commerce) Rules, 2020, Rule 5) requires e-commerce entities to display the legal name and registered/head office address of the business. Drafting this page surfaced two founder blockers — flagged in the "Founder decisions needed" section at the bottom. Fix those before shipping.
>
> **Voice note for the founder:** kept short and restrained. The Consultant doesn't lay out a maze of forms; the Consultant gives you one address and trusts you to use it. One Cormorant headline option suggested below for the copy-consultant-agent to refine.

---

## Page content (draft)

### Headline

> **Reach The Consultant.**

*(Cormorant Garamond italic, gold, as the page H1. One option only — the copy-consultant-agent should consider variants like "Speak to us." or "The Consultant is reachable." before ship. Founder owns the final pick.)*

### Sub-headline (optional, Sora regular, ink-dim)

> For questions about your subscription, your data, or the product — these are the three ways in.

---

### Block 1 — Email

**Email**
`digitglobal.org@gmail.com`

We read every message. Expect a reply within two working days.

> **Founder decision needed — flag #1:** the email above is the founder's general business address. For the Privacy Policy grievance officer route, Razorpay merchant trust signals, and basic operational hygiene, we recommend setting up at minimum two dedicated aliases **before this page ships**:
>
> - `support@maincharacter.digitglobalservices.com` — general customer queries, listed here on the Contact page
> - `grievance@maincharacter.digitglobalservices.com` — DPDPA grievance officer route, listed in the Privacy Policy
>
> Both can forward to `digitglobal.org@gmail.com` so the founder still reads them in one inbox. Setup is 15 minutes in Resend / Google Workspace / Cloudflare Email Routing. The reason this matters: a `@gmail.com` address on the Contact page of a paid Indian subscription product signals "this is a side project" — even when it isn't. It also blurs the legal separation between the personal/parent-company inbox and the MainCharacter operational inbox, which we want to keep clean for audit and discovery. **Until the aliases exist, the Gmail address stays as-is, but ship the aliases on or before the day this page goes live.**

---

### Block 2 — WhatsApp

**WhatsApp**
`+91 99585 33994`

This is the verified business number for The Consultant. You can write to us here for anything subscription-related. Replies are not always instant — we aim to respond within one working day.

> **Note for the founder:** until Meta WhatsApp Cloud API is approved and `WHATSAPP_SEND_MODE=all`, outbound WhatsApp from this number is in DRY-RUN (CLAUDE.md landmine #5). Listing the number is fine — incoming messages still arrive on the phone itself — but the page should not promise faster response times than we can actually meet. The current draft language ("not always instant... within one working day") is intentionally conservative.

---

### Block 3 — Office address

**Postal address**
`[FOUNDER TO FILL — Digit Global Services registered office address]`

> **Founder decision needed — flag #2 (this is a real blocker):** there is no postal address on file in CLAUDE.md or in the handoff brief. **Razorpay's published merchant requirements require a physical address** on the Contact page before live KYC is fully approved, and the Consumer Protection (E-Commerce) Rules, 2020 (Rule 5) require e-commerce entities to display the legal name and the registered or head-office address. Without this address, three things stall:
>
> 1. We cannot publish a Contact page that meets Razorpay's published merchant requirements — meaning the broken `/#` footer links cannot be repaired with this draft until the address exists.
> 2. The Privacy Policy's grievance contact (DPDPA Section 8(9)) is incomplete.
> 3. The Terms of Service's "who you are agreeing with" clause and the jurisdiction clause (Bengaluru / Delhi / wherever Digit Global Services is registered) are incomplete.
>
> Options the founder has:
>
> - **Option A — use the registered office of Digit Global Services if it already exists** with the MCA or as a sole-proprietor registration. This is the simplest and the correct answer.
> - **Option B — register a virtual office address** (services like InstaSpaces, Qdesq, MyHQ) for ~INR 1,000–3,000/month in a tier-1 city. Provides a real address that receives physical post, valid for GST registration and Razorpay KYC. Reasonable for an early-stage operation that doesn't have a physical office.
> - **Option C — use the founder's residential address.** Cheapest, valid for sole-proprietor and Pvt Ltd registration, but publishes a personal address on a public web page. Generally not recommended for a consumer product where the founder receives strong opinions from strangers.
>
> Recommended path: **Option A if available, Option B if not, Option C only as a last resort.** This is a founder decision the AI cannot make and must not invent.

---

### (Footer line on the page itself, Sora small, ink-dim)

> **Operated by Digit Global Services.** ◆ MainCharacter

---

## Frontend handoff notes (for the frontend-agent, later)

Do not wire this page until the founder has:

1. Confirmed the legal entity name and registered office address (resolves flag #2).
2. Set up the `support@` and `grievance@` aliases (resolves flag #1) **or** explicitly approved shipping with the Gmail address.
3. Approved the headline option (or supplied an alternate from the copy-consultant-agent).

Once those are confirmed, the page lives at `/contact` and the three broken footer links (`Privacy`, `Terms`, `Contact`) in `landing.html` get repaired in a single commit — but that wiring is the frontend-agent's job in a separate ticket, not this one.

---

## Founder decisions needed (summary, for the brief-back)

1. **support@ and grievance@ aliases** — set up before this page ships (flag #1).
2. **Postal address** — this is a real blocker for Razorpay KYC and DPDPA compliance (flag #2).
3. **Headline copy** — approve "Reach The Consultant." or supply alternate.

---

> **End of draft.** Short page, but two of the three blocks expose operational gaps the founder needs to close before the page can ship. Better to surface those now than to publish a page that quietly fails Razorpay's merchant trust review or the DPDPA's grievance-redressal mechanism.
