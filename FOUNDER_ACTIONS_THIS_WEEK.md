# Founder Actions — This Week

**Generated:** 2026-05-28
**Source:** Phase 1 §0 Launch Prerequisites (`security/audit-pre-public-launch.md`, `product/ROADMAP_TO_1CR.md` §0)

> 🚨 **NEW REVENUE-GATING BLOCKER (discovered 2026-05-28 during dogfood):** Razorpay account does not have Subscriptions / recurring payments enabled. Every subscription checkout fails with "seller does not support recurring payments." **NOTHING can be charged until this is resolved** — this is the longest external lead time on the board now. See item #10 below.
**Why this list exists:** None of the Top-3 growth bets (NOW-1/2/3) reaches a single real paying customer until these are done. Three are hard launch BLOCKERS. One (the lawyer) has external lead time — **start it today even though it finishes last.**

> Legend: 🔴 BLOCKER (gates `PAYWALL_PUBLIC`) · 🟠 gates a specific flip · 🟢 do-soon hygiene
> "Render only" = set the value in the Render dashboard environment, NEVER in a committed file.

---

## 1. 🔴 Rotate the leaked Gemini API key

- **What:** The current live Gemini key sits in git history (verified identical hash to the committed `.env`). Anyone with repo access holds it. Revoke it, issue a new one, set the new one in Render only.
- **Steps:**
  1. Go to **Google AI Studio → Get API key** (https://aistudio.google.com/app/apikey) — or Google Cloud Console → APIs & Services → Credentials if the key is project-scoped.
  2. **Delete/revoke** the existing key (starts `AIzaSyBr…`).
  3. **Create new API key**, copy it.
  4. Render dashboard → your service → **Environment** → update `GEMINI_API_KEY` → Save (triggers redeploy).
  5. Confirm `/health` shows Gemini `configured: true` after redeploy.
- **Why it blocks:** Security BLOCKER #1. A leaked, never-rotated key is live-credential exposure. Gates every flag flip.
- **Time:** ~10 min.

## 2. 🔴 Rotate the Razorpay key + secret

- **What:** The Razorpay `KEY_SECRET` is also in git history, verified un-rotated. Regenerate it. Do this as part of going live (test → live).
- **Steps:**
  1. Razorpay Dashboard → **Account & Settings → API Keys** (https://dashboard.razorpay.com/app/keys).
  2. **Regenerate** keys (this invalidates the old secret). Download/copy `key_id` + `key_secret`.
  3. When you're ready for live: complete KYC, switch the dashboard to **Live Mode**, generate **live** keys (`rzp_live_*`).
  4. Render → Environment → update `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` → Save.
- **Why it blocks:** Security BLOCKER #1 + gates the `rzp_test_* → rzp_live_*` swap (roadmap 0-A1/0-A4).
- **Time:** ~15 min (more if KYC isn't done — start KYC now if not).

## 3. 🔴 Engage a DPDPA data-protection lawyer (START TODAY — longest lead time)

- **What:** The product collects facial photographs (audit + daily mirror selfies) = sensitive personal data under India's DPDPA. There is **no Privacy Policy, no consent capture, no 18+ gate** today. You need a lawyer to draft compliant Privacy Policy + Terms before any public launch. Security explicitly does NOT sign off on legal text.
- **Steps:**
  1. Engage an India data-protection / tech lawyer (or a firm with DPDPA practice).
  2. Brief scope — the policy must cover: (a) biometric/sensitive photo data; (b) cross-border processing to Google/Gemini (US); (c) retention & deletion periods; (d) Data Fiduciary contact (your email); (e) Data Principal rights (access/correction/deletion/portability); (f) 18+ restriction.
  3. Also ask for a medical-claims review of the Hair (Norwood) and skin protocol copy before any paid hair/skin marketing.
  4. Give them the engineering counterpart: we'll serve `/privacy` + `/terms`, wire the footer links, and add a consent checkbox + 18+ confirmation before photo upload once their text lands.
- **Why it blocks:** Security BLOCKER #2. Collecting biometrics with no notice/consent is a DPDPA breach. Gates `PAYWALL_PUBLIC`. **This is the external long pole — engineering will finish before the lawyer does, so start now.**
- **Time:** ~30 min to engage; days/weeks of their lead time.

## 4. 🟠 Set `RAZORPAY_WEBHOOK_SECRET` (currently EMPTY)

- **What:** The webhook secret is blank in `.env`. While blank, the verifier rejects every webhook (fails closed) — meaning **no subscription ever activates, no receipt ever fires**. You must create the webhook in Razorpay and paste its secret.
- **Steps:**
  1. Razorpay Dashboard → **Settings → Webhooks → Add New Webhook**.
  2. URL: `https://maincharacter.digitglobalservices.com/api/payment/webhook`
  3. Select events: `payment.captured`, `subscription.activated`, `subscription.charged`, `subscription.cancelled`, `subscription.halted`.
  4. Set a **secret** (generate a strong random string), save.
  5. Render → Environment → set `RAZORPAY_WEBHOOK_SECRET` to that exact string → Save.
- **Why it blocks:** Security #2. Gates `rzp_live_*` and `PAYWALL_PUBLIC` — without it paid users silently never activate. Required for NOW-1/NOW-3 revenue to land.
- **Time:** ~10 min.

## 5. 🟠 Set `JWT_SECRET` (64-char random)

- **What:** Today JWT signing falls back through `ADMIN_PASSWORD_HASH` → `ADMIN_PASSWORD` → a hardcoded dev string. Tokens may be signed with a guessable secret. Set a real one.
- **Steps:**
  1. Generate a 64-char random secret. On your machine: `! openssl rand -hex 32` (gives 64 hex chars). (Type the `!` in the Claude Code prompt to run it here, or run in any terminal.)
  2. Render → Environment → set `JWT_SECRET` (and `ADMIN_JWT_SECRET` if used) to that value → Save.
- **Why it blocks:** Security MEDIUM. Required before login (0-B1 / P0-1) ships to real users — sessions for paying customers must be signed with a strong secret.
- **Time:** ~5 min.

## 6. 🟠 Set `ADMIN_PASSWORD_HASH` (bcrypt — kills the plaintext fallback)

- **What:** `lib/auth.js` falls back to plaintext `'maincharacter2026'` if no hash is set. Setting a bcrypt hash auto-disables the legacy plaintext header path.
- **Steps:**
  1. Generate a bcrypt hash of your chosen admin password (the project uses `bcryptjs` — confirmed in `lib/auth.js`). Run from the repo root:
     `! node -e "console.log(require('bcryptjs').hashSync(process.argv[1],10))" 'YOUR_STRONG_PASSWORD'`
  2. Render → Environment → set `ADMIN_PASSWORD_HASH` to the output → **remove** `ADMIN_PASSWORD` → Save.
- **Why it blocks:** Security MEDIUM. Default admin credentials must not survive into production. Do before any flag flip.
- **Time:** ~5 min.

## 7. 🟠 Set `WHATSAPP_APP_SECRET` (before WhatsApp goes live)

- **What:** While unset, the WhatsApp webhook accepts unsigned (forgeable) inbound messages — safe only while WhatsApp is DRY-RUN. Before `WHATSAPP_SEND_MODE=all`, set the app secret so `x-hub-signature-256` is verified.
- **Steps:**
  1. Meta for Developers → your App → **Settings → Basic → App Secret** (https://developers.facebook.com/apps) → Show → copy.
  2. Render → Environment → set `WHATSAPP_APP_SECRET` → Save.
- **Why it blocks:** Security #4. Gates `WHATSAPP_SEND_MODE=all` specifically (not the paywall). Needed before NOW-1's gated follow-up channel goes live.
- **Time:** ~5 min.

## 9. 🟠 Set up Resend (gates the email magic-link recovery + receipt fallback)

- **What:** The login gate (Phase 2, approved 2026-05-28) uses email magic link via Resend as the recovery surface. Silent first-login on `/payment-confirmed` works without Resend, so build does NOT block on this — but every recovery scenario (returning user on a second device, F1 webhook race, F2 closed-tab fallback) needs Resend live. Spec: `product/spec-login-gate.md` §13.
- **Steps:**
  1. Sign up at https://resend.com (free tier ~3,000 emails/mo — fine for dogfood + first cohort).
  2. Add a sending domain — likely `maincharacter.digitglobalservices.com` or a `mail.` subdomain.
  3. Resend will show you 3-4 DNS records to add (SPF / DKIM / DMARC). Add them at your DNS provider (Render manages the apex if you set it up there; otherwise wherever your domain DNS lives). Verify in Resend dashboard (instant once DNS propagates — usually <1 hr).
  4. Generate an API key in Resend → API Keys → Create API Key. Copy.
  5. Render → Environment → set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (e.g. `consultant@maincharacter.digitglobalservices.com`) → Save.
  6. While dogfooding: also set `EMAIL_ALLOWLIST` to your email + any test users — Resend will only deliver to allowlisted addresses while `WHATSAPP_SEND_MODE=allowlist`.
- **Why it blocks:** The email magic-link login + the receipt-email magic-link fallback + the F1/F2 recovery flows degrade to DRY-RUN (logged, no send) until this lands. Build merges with `LOOKMAX_EMAIL_LOGIN=false` so nothing user-visible breaks; founder flips the flag once Resend is live + dogfood verifies one happy-path login.
- **Time:** ~30 min hands-on (sign up, DNS records, paste 2 env vars) + DNS propagation wait.

---

## 8. 🟢 Authorize the `services/gemini.js:85` prompt-injection fix (engineering — queue it)

- **What:** This is a code change, not a dashboard action — listed here so you explicitly greenlight it. `generateEvolutionAssessment()` concatenates `user.name` + raw user replies into the Gemini prompt with no delimiter/guard (the other three Gemini call sites are guarded; the handoff wrongly claimed all four were). It's a small, isolated, test-first fix independent of any NOW brief.
- **Your action:** Reply "fix gemini.js:85 now" and I'll have backend-agent wrap the inputs in the `<<<USER_INPUT>>>` delimiter + guard pattern and add a regression test — a contained ~1-hour change that does NOT require starting the Top-3 build. (Left un-started for now per the Phase 1.5 hard stop.)
- **Why it matters:** Security HIGH. A known landmine flagged as fixed when it isn't. Not a paywall blocker, but ship it before sustained traffic.
- **Time:** ~0 founder min (just authorize); ~1 hr autopilot.

---

## 10. 🔴 BLOCKER — Enable Razorpay Subscriptions / recurring payments on the account

- **What:** Discovered during dogfood 2026-05-28. The subscription object created OK (`sub_Suhr5kDlLNt5Gg`), but Razorpay's hosted checkout rejected the charge with **"seller does not support recurring payments."** This is a Razorpay-side account flag — the codebase is doing the right thing; the *account* isn't enabled for Subscriptions. **No paying customer can complete checkout until this is resolved.** Gates the entire revenue flow.
- **Steps:**
  1. Razorpay Dashboard → **Subscriptions** tab (https://dashboard.razorpay.com/app/subscriptions) → check the account status. If you see a "Subscriptions not enabled" / "Get in touch with support" prompt, that's the issue.
  2. Razorpay Dashboard → **Support** → submit a ticket: *"Please enable Razorpay Subscriptions / recurring payments on my account [Account ID]. The error 'seller does not support recurring payments' is returned at checkout despite the subscription object being created. Subscription ID for reference: sub_Suhr5kDlLNt5Gg."*
  3. Razorpay typically asks for: GST certificate, MOA/AOA or business-registration doc, a brief description of the recurring product (you sell ₹799/₹1,499/₹1,999 monthly self-improvement subscriptions delivered via web PWA + WhatsApp), and may want to verify the website. Have these ready.
  4. Wait for Razorpay confirmation (commonly 1-3 business days, can be longer if they request additional docs).
  5. Once enabled: re-test with `4111 1111 1111 1111` on test mode end-to-end before flipping to live keys. Then proceed to action #2 (regenerate to `rzp_live_*`).
- **Why it blocks:** **Everything revenue-related.** Until enabled: zero subscriptions can be charged, the silent-first-login flow cannot be dogfooded end-to-end, NOW-1/2/3 cannot reach real paying users. This is now the long-pole external dependency alongside #3 (DPDPA lawyer).
- **Time:** ~30 min hands-on (ticket + doc upload). 1-3 business days waiting for Razorpay.

---

## Sequencing (do in this order)

```
TODAY:
  #10 open Razorpay support ticket (NEW external long pole — start now)
  #3 lawyer engagement (external long pole — start now)
  #1 rotate Gemini   #2 rotate/regenerate Razorpay (+ start KYC if needed)
  #5 JWT_SECRET   #6 ADMIN_PASSWORD_HASH   (5 min each, do them in one Render sitting)

BEFORE any subscription charge can complete (revenue blocker):
  #10 Razorpay Subscriptions enabled

BEFORE rzp_live / PAYWALL_PUBLIC:
  #4 RAZORPAY_WEBHOOK_SECRET → #10 Razorpay Subscriptions enabled → swap rzp_live → test ONE ₹1 subscription end-to-end → only then flip PAYWALL_PUBLIC (still capped at ≤50 paid users until Postgres lands)

BEFORE WHATSAPP_SEND_MODE=all:
  #7 WHATSAPP_APP_SECRET

ANYTIME (just authorize):
  #8 gemini.js:85 guard
```

**Reminder — flips that remain founder-only (do not let autopilot do these):** `PAYWALL_PUBLIC=true`, `rzp_test_* → rzp_live_*`, `WHATSAPP_SEND_MODE=all`, any spend over ₹5,000.

Once #1–#7 are done and the lawyer text + engineering gates (login P0-1, photo-delete/consent, photo-upload recovery, 🔥 removal) land, ping security-compliance-agent for a re-audit before flipping anything.
