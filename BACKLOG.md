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

## NEXT-WEEK PRIORITIES
- [ ] Aesthetic pillar — wire the existing audit prototype to a real product flow
- [ ] Sage pillar — write 7-day content matching Orator structure
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
