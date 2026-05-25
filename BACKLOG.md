# MainCharacter Backlog

## FOUNDER ACTIONS REQUIRED (cannot be done by AI)

> **⚠ TOP PRIORITY — outgoing WhatsApp is locked to ADMIN_PHONE only.**
> During the overnight autopilot run, `WATI_SEND_MODE` defaults to `allowlist`
> (sends only to `ADMIN_PHONE`) so a redeploy cannot re-trigger the spam loop.
> - [ ] **Set `WATI_SEND_MODE=all` in Render env to resume sending to real users** (after auditing the diff).

- [ ] Rotate Gemini API key (was committed in .env — still in git history)
- [ ] Rotate Wati JWT (was committed in .env — still in git history)
- [ ] Rotate Razorpay test keys; complete KYC; paste live keys into Render env
- [ ] Set `ADMIN_PASSWORD_HASH` in Render env (bcrypt hash — see DECISIONS.md / lib/auth.js)
- [ ] Set `WATI_WEBHOOK_SECRET` in Render env (for incoming webhook verification)
- [ ] Set `RAZORPAY_WEBHOOK_SECRET` in Render env + configure the webhook in Razorpay dashboard pointing at `/api/payment/webhook`
- [ ] Create Supabase project; paste DATABASE_URL into Render env
- [ ] Create Sentry project; paste SENTRY_DSN into Render env
- [ ] Create Resend account; paste RESEND_API_KEY into Render env
- [ ] (Optional) Create Upstash Redis; paste REDIS_URL into Render env
- [ ] Configure cron-job.org to ping /health every 5 minutes (free-tier scheduler workaround)
- [ ] Approve Wati templates for: welcome, day-1-morning, day-N-morning, day-7-report, payment-confirmation, subscription-cancelled
- [ ] Upgrade Render web service from Free to Starter ($7/mo) before first paid customer
- [ ] Set up Cloudflare in front of the domain for caching + DDoS protection

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
      /upgrade?to=auraplus pre-select). NOTE: audit page already routes
      ?intent=bundle → /upgrade?to=auraplus.
- [ ] Referral programme — "Invite 3 to unlock ₹200 off"
- [ ] LTV/cohort analytics on /admin
- [ ] Mobile-app shell (PWA first; React Native later)
- [ ] Move JSON-file fallback out entirely once Postgres is stable for 7 days
- [ ] P1.1 Postgres/Prisma migration — schema drafted, NOT wired (needs DATABASE_URL to test against; JSON store retained as default to avoid breaking prod overnight)

## BUGS / INCONSISTENCIES FOUND
- [x] (Night 2, P1.1) `START NOW` now seeds the Day-1 lexicon via
      `User.addWordsLearned(phone, DAYS[1].words, 1)` in `handleStartNow`.
      Regression test: `tests/start-now.test.js`.
- [x] (Night 2, P1.2) `/api/webhook/wati` + `/webhook` now verify incoming
      requests via `wati.verifyWebhookRequest` (HMAC `x-wati-signature` →
      IP-allowlist → open+warn). Test: `tests/wati-webhook-verify.test.js`.
      FOUNDER ACTION: set `WATI_WEBHOOK_SECRET` in Render (else open mode).

## COPY REVIEW QUEUE (founder must approve before shipping)
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
