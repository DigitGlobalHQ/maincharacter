# MainCharacter Backlog

## NIGHT 3 — FOUNDER ACTIONS (in this order):

> **⚠ Wati was removed in Night 3.** All outbound WhatsApp is in DRY-RUN until the
> Meta Cloud API credentials are pasted into Render. SMS (MSG91) and email
> (Resend) are also DRY-RUN until their keys are set. `WHATSAPP_SEND_MODE` stays
> `allowlist` (only `ADMIN_PHONE` / `ADMIN_EMAIL` receive real sends) until the
> founder flips it to `all`. See WHATSAPP_CLOUD_API_SETUP.md.

- [ ] Cancel Wati subscription in Wati dashboard.
- [ ] Free up phone number 9958533994 (delete WhatsApp Business App from phone if installed; wait 24h).
- [ ] Create personal Meta Business Manager at business.facebook.com.
- [ ] Create new WhatsApp Business Account inside it (display name: MainCharacter, category: Education).
- [ ] Add phone 9958533994 to that WABA.
- [ ] Wait for display name approval (24-72h).
- [ ] Generate system user access token with whatsapp_business_messaging + whatsapp_business_management permissions.
- [ ] Note: WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_BUSINESS_ACCOUNT_ID.
- [ ] Submit message templates for re-approval: welcome, day_one_morning, day_n_morning, evolution_report_ready, payment_confirmation, subscription_paused (same copy as Wati versions).
- [ ] Sign up for MSG91 at msg91.com, prepaid wallet ₹500, get auth key + DLT-approved OTP template ID.
- [ ] Sign up for Resend at resend.com, verify sending domain (maincharacter.digitglobalservices.com — add DNS records: SPF, DKIM).
- [ ] Paste all 11 new env vars into Render (see list below).
- [ ] Run smoke test: send an OTP to ADMIN_PHONE; confirm receipt.
- [ ] Flip WHATSAPP_SEND_MODE=all when ready to send to real users.

### NIGHT 3 — new Render env vars to paste
- [ ] `WHATSAPP_ACCESS_TOKEN` (Meta system user token)
- [ ] `WHATSAPP_PHONE_NUMBER_ID` (Meta phone number ID)
- [ ] `WHATSAPP_BUSINESS_ACCOUNT_ID` (Meta WABA ID)
- [ ] `WHATSAPP_APP_SECRET` (Meta app secret — for webhook signature verify)
- [ ] `WHATSAPP_VERIFY_TOKEN` = `3e90099f-e036-458e-8d1d-da6d0b84ce3f` (generated Night-3; paste this exact value into BOTH Render env and the Meta App webhook config)
- [ ] `MSG91_AUTH_KEY`
- [ ] `MSG91_TEMPLATE_ID_OTP` (DLT-approved OTP template ID)
- [ ] `MSG91_SENDER_ID` (6-letter sender ID, e.g. `MAINCH`)
- [ ] `RESEND_API_KEY`
- [ ] `RESEND_FROM_EMAIL` (e.g. `consultant@maincharacter.digitglobalservices.com`)
- [ ] `ADMIN_EMAIL` (founder's email for admin alerts + email allowlist)

## FOUNDER ACTIONS REQUIRED (cannot be done by AI)

> **⚠ TOP PRIORITY — outgoing messaging is locked to ADMIN_PHONE / ADMIN_EMAIL only.**
> `WHATSAPP_SEND_MODE` defaults to `allowlist` so a redeploy cannot re-trigger a
> send loop. It governs WhatsApp, SMS and email together.
> - [ ] **Set `WHATSAPP_SEND_MODE=all` in Render env to resume sending to real users** (after auditing the diff).

- [ ] Rotate Gemini API key (was committed in .env — still in git history)
- [ ] Rotate Razorpay test keys; complete KYC; paste live keys into Render env
- [ ] Set `ADMIN_PASSWORD_HASH` in Render env (bcrypt hash — see DECISIONS.md / lib/auth.js)
- [ ] Set `RAZORPAY_WEBHOOK_SECRET` in Render env + configure the webhook in Razorpay dashboard pointing at `/api/payment/webhook`
- [ ] Create Supabase project; paste DATABASE_URL into Render env
- [ ] Create Sentry project; paste SENTRY_DSN into Render env
- [ ] (Optional) Create Upstash Redis; paste REDIS_URL into Render env
- [ ] Configure cron-job.org to ping /health every 5 minutes (free-tier scheduler workaround)
- [ ] Upgrade Render web service from Free to Starter ($7/mo) before first paid customer
- [ ] Set up Cloudflare in front of the domain for caching + DDoS protection

> WhatsApp / SMS / email channel setup (Meta, MSG91, Resend) is in the
> **NIGHT 3 — FOUNDER ACTIONS** section at the top of this file.

## ARCHIVED — WATI (removed Night 3)

Wati was ripped out in the Night-3 migration (DECISIONS.md). These items no
longer apply; kept for history.

- ~~Rotate Wati JWT~~ — the key is dead; nothing reads it.
- ~~Set `WATI_WEBHOOK_SECRET`~~ — replaced by `WHATSAPP_APP_SECRET` (Meta `x-hub-signature-256`).
- ~~Approve Wati templates~~ — re-submit templates in Meta instead (see NIGHT 3 founder actions).
- [ ] After ~2026-06-26 (30 days): delete the `/api/webhook/wati` and `/webhook` 308 redirects and the legacy `WATI_SEND_MODE` fallback in `lib/messaging-mode.js`.
- (Night 2, P1.2) `/api/webhook/wati` HMAC `x-wati-signature` verification + `tests/wati-webhook-verify.test.js` — removed; superseded by Meta signature verification in `services/whatsapp.js` + `tests/whatsapp.test.js`.

### NIGHT 2 — FOUNDER ACTIONS REQUIRED
- [ ] `npm install sharp @aws-sdk/client-s3 web-push` then redeploy. Until then:
      audit/mirror photos store to a LOCAL dir (volatile on Render redeploy) and
      images are NOT resized. These deps are lazy-required so the app deploys fine
      without them (DECISIONS.md P0.3) — but storage is not durable until R2 is wired.
- [ ] Add `ffmpeg` to the Render container (`apt-get install -y ffmpeg` in the
      build command, or a Docker image with it preinstalled). Confirmed MISSING in
      the current container — the P9 weekly-reveal video will use the static-image
      fallback until this is fixed.
- [ ] Create a Cloudflare R2 bucket; set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
      `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` in Render env (durable photo/video storage).
- [ ] Generate VAPID keys (`npx web-push generate-vapid-keys`) and set
      `WEB_PUSH_VAPID_PUBLIC` + `WEB_PUSH_VAPID_PRIVATE` in Render (PWA push).
- [ ] Verify/create Razorpay Plans for orator-monthly-799, lookmaxxing-monthly-1499,
      aura-plus-monthly-1999 (P4 — subscriptions code lands next).
- [ ] Review the new audit funnel live at /audit on a phone, in real light, with
      real photos — assess the Gemini diagnosis copy in The Consultant's voice.

## NEXT-WEEK PRIORITIES
- [x] (Night 2, P3) Aesthetic pillar → Lookmaxxing: free audit funnel live
      end-to-end (/audit): landing card → quiz → photos → Gemini-vision Aura
      Score + diagnosis → paywall handoff. Backend: AuditSession model,
      services/vision.js, data/lookmax-prompts.js, services/storage.js, routes/audit.js.
- [ ] Sage pillar — write 7-day content matching Orator structure

## NIGHT-2 LOOKMAXXING — REMAINING P-BLOCKS (deferred, not yet built)
- [ ] P4 — Paywall page + Razorpay Subscriptions (createOrFetchPlan,
      createSubscription, /api/payment/subscribe, webhook flips oratorActive/
      lookmaxxingActive, bundle math ₹1,999 when both). Data model + Aura++ status
      helper (User.computeAuraStatus) already shipped in P0.5.
- [ ] P5 — Lookmaxxing PWA shell (manifest, service worker, phone+OTP auth,
      install prompt, push subscribe).
- [ ] P6 — Daily Mirror score (camera capture, vision.scoreMirror, streak, Mirror
      Level, 6:30am reminder). Prompt builder (buildMirrorPrompt) already in place.
- [ ] P7 — Daily Protocol checklist (data/lookmax-content.js PROTOCOL_LIBRARY,
      services/protocol.js generator, checklist UI).
- [ ] P8 — Hair Receding tracker (Norwood estimate, evidence-based rec engine
      services/hair.js, /lookmax/hair marketing page).
- [ ] P9 — Weekly Reveal video (ffmpeg composer w/ static fallback, share sheet).
- [ ] P10 — Day-30 re-audit + cross-sell (side-by-side delta, evolution write-up).
- [ ] P11 — Cross-sell automation (Orator Day-7 report + Lookmaxxing first reveal,
      Aura++ pre-select). NOTE: audit page now routes ?intent=bundle →
      /paywall?intent=bundle (Night-3 P5); paywall pre-selects Aura++.
- [ ] Referral programme — "Invite 3 to unlock ₹200 off"
- [ ] LTV/cohort analytics on /admin
- [ ] Mobile-app shell (PWA first; React Native later)
- [ ] Move JSON-file fallback out entirely once Postgres is stable for 7 days
- [ ] P1.1 Postgres/Prisma migration — schema drafted, NOT wired (needs DATABASE_URL to test against; JSON store retained as default to avoid breaking prod overnight)

## BUGS / INCONSISTENCIES FOUND
- [x] (Night 2, P1.1) `START NOW` now seeds the Day-1 lexicon via
      `User.addWordsLearned(phone, DAYS[1].words, 1)` in `handleStartNow`.
      Regression test: `tests/start-now.test.js`.
- [x] (Night 3) Incoming webhook verification now uses Meta's `x-hub-signature-256`
      (`services/whatsapp.verifyWebhookSignature`, `tests/whatsapp.test.js`).
      Superseded the Night-2 Wati `x-wati-signature` verifier (see ARCHIVED — WATI).
      FOUNDER ACTION: set `WHATSAPP_APP_SECRET` in Render (else open + boot warn).

## NIGHT 4 — FOUNDER ACTIONS / DEFERRED
- [ ] **Flip `PAYWALL_PUBLIC=true`** in Render only after dogfood validation — until
      then `/paywall` serves the waitlist page and NO Razorpay charge can fire.
- [ ] Set `ADMIN_PHONES` (comma-separated) + `ADMIN_EMAILS` in Render for multi-admin.
- [ ] Set `JWT_SECRET` in Render (Lookmaxxing PWA token signing; falls back to ADMIN_JWT_SECRET).
- [ ] **R2 photo migration (week 2):** mirror + hair photos currently save to
      `/tmp/maincharacter-uploads/{userId}/` and are LOST on every Render redeploy.
      Wire `services/photos.js` to Cloudflare R2 (R2_* env + @aws-sdk) for durable storage.
- [ ] **ffmpeg weekly-reveal MP4 (week 2):** `public/lookmax/reveal.html` renders a
      client-side canvas slideshow as the stub. Add ffmpeg to the Render container and
      replace it with real MP4 generation. See AUTOPILOT_PROMPT_V2.md §P9 for the spec.
- [ ] Web push: set `WEB_PUSH_VAPID_PUBLIC`/`WEB_PUSH_VAPID_PRIVATE` to enable PWA push
      (currently the mirror nudge is WhatsApp-only and send-mode gated).
- [ ] OTP login stays dormant until Meta display name is approved — then set
      `WHATSAPP_OTP_ENABLED=true` (and `WHATSAPP_OTP_TEMPLATE` if not `otp_login`).

## COPY REVIEW QUEUE (founder must approve before shipping)
- (Night 4, P5) **Entire `data/lookmax-content.js` PROTOCOL_LIBRARY** (22 do-items +
  8 do-nots across skin/hair/jaw/posture/lifestyle) is drafted to the evidence spec
  and flagged `// TODO copy review`. The founder (Customer #1) receives every item
  unfiltered (minoxidil, ketoconazole, retinoid, "DO NOT use jaw exercisers"). Review
  voice + medical framing before public launch. Same for `data/hair.js` Norwood
  recommendation library and the Consultant-voice lines in services/hair.js + vision.consultantLine.
- (Night 4, P0/P2-P8) New PWA user-facing strings (paywall-waitlist, login/admin-login,
  mirror rotating lines, protocol headers, hair capture instructions, reveal caption +
  stub note, dashboard cross-sell) are all flagged `// TODO copy review` in-file.
- Payment confirmation + cancellation WhatsApp copy in routes/api.js
  (processPaymentEvent) was taken verbatim from the autopilot brief, not
  invented — confirm it reads correctly in The Consultant's voice.
- No new Consultant copy was improvised this run. The 7-day Orator content is
  unchanged (guarded by a snapshot test in tests/orator-content.test.js).
- (Night 2, P3) Audit quiz questions Q2-Q12 in public/audit.html are a working
  DRAFT to the brief's category spec (Q1 skin is verbatim from the brief). Review
  the voice before treating as final. Marked with a TODO copy review comment.
- (Night 2, P3) Fallback aesthetic diagnosis (services/vision.js fallbackDiagnosis)
  and the mirror-delta line (data/lookmax-prompts.js mirrorDeltaLine) are restrained
  placeholders used only when Gemini is unavailable. Approve or replace.
- (Night 2) The landing Lookmaxxing card + Aura++ section copy is verbatim from
  the brief; the "Two Quests"/"Two pillars" count edits are factual, not voice.
- (Night 3, P4) Email templates in `data/email-templates/` (paywall-receipt,
  audit-confirmation, day7-evolution-report) are drafted to The Consultant's
  voice and flagged `<!-- TODO copy review -->`. Approve the headlines + body
  before flipping email to live. The Day-7 fallback assessment line and the
  receipt/CTA microcopy especially.
- (Night 3, P5) Paywall page (`public/paywall.html`) card copy follows the brief
  bullets verbatim; the Aura++ "Founder access to The Consultant chat" bullet is
  flagged TODO copy review (not yet a shipped feature).
