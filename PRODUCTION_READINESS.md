# MainCharacter — Production Readiness

> **Live commit at this writing:** `d019389`
> **Last sweep:** 2026-05-28
> **Scope:** Lookmaxxing pillar only. Orator dormant pending Meta WhatsApp setup.
> **Tests:** 915 passing · 20 skipped (skips: durability-prod-shape requires Render env; storage-r2 live tests require R2 creds; few non-critical timing tests). · **Smoke:** 31/31.

---

## 1. What is production-ready NOW (built, tested, browser-verified)

### Surfaces (all 8 sweep-clean)
- **/** landing — pillar cards (Orator + Lookmaxxing), chips `WEB / DAILY / MONTH 1`, frame line *"Two paths. Pick the work."*, footer (Privacy/Terms/Refund still `/#` — see §3)
- **/audit** — 6 scenes including photo upload + *"Hold this reading"* recovery (F3), audit echo on paywall and waitlist (F1+F2)
- **/paywall** — 3 cards (Aura++ "MOST CHOSEN"), 5-bullet Aura++ (Consultant-chat bullet removed), A/B tag variant C *"Voice and presence, one arc"* live, in-voice blank-email validation. Behind `PAYWALL_PUBLIC=false` flag — serves waitlist by default.
- **/lookmax/login** — magic-link 3-state (request/inbox/error). Loading flash now reads *"Holding the door."*
- **/lookmax/** dashboard — Mirror primary card, secondary protocol+hair row, streak as `Day N` (zero fire emojis anywhere), earned-moment Aura++ cross-sell with silence guarantee + dismiss
- **/lookmax/mirror, /protocol, /hair, /reveal** — full design-spec lift. Weekly + Day-30 reveal modes. All 30 founder-approved Consultant strings in place.
- **/payment-confirmed** — earned-moment hierarchy, `◆` breath animation, KPI events wired
- **/admin** — Dogfood Tools panel (Grant / Time-warp / Simulate UP·FLAT·DOWN reveal)

### Persistence (B0)
- **Postgres (Neon, Singapore)** via `lib/db.js`. Schema in `migrations/0001_init.sql`: users, audit_sessions, early_access, events, push_subscriptions, schema_migrations.
- **Cloudflare R2** photo storage via `services/storage.js`. Bucket `maincharacter-lookmax`. Signed-URL serving (TTL 900s default, 24h for DPDPA export).
- Both gated by env presence; JSON + DRY-RUN fallback when unset (zero behavioral diff in tests).
- `/health` reports `database: true, storage.configured: true`.

### Photo hygiene (B0 + tonight's hardening)
- **Pre-upload compression** via `sharp`: longest-edge ≤1600px, JPEG q78, EXIF stripped except orientation, auto-orient applied. Typical 3MB selfie → ~250KB.
- **Retention pruner**: last 7 daily mirrors, last 4 weekly hair, baseline + Day-30 kept until cancellation. Fires fire-and-forget after each upload.
- **DPDPA endpoints**: `DELETE /api/lookmax/me/data` (with `?dry-run=true` escape hatch), `GET /api/lookmax/me/data/export` (signed URLs, no raw R2 keys leaked). Behind `DPDPA_RIGHTS_ENABLED=true` (default on).

### Day-30 Re-Audit (B2)
- Durable baseline snapshot at payment activation (survives the 24h AuditSession TTL)
- `GET /api/lookmax/reaudit/status` — pull-based eligibility (≥30 days since lookmaxxingStartedAt)
- `GET /api/lookmax/reaudit/result` — signed-URL photos, server-side template selector for UP/FLAT/DOWN variants
- **Held-count branching for DOWN** verified by 8 branching tests: if zero axes held, the line `The axes that held tell us the protocol held.` is dropped; otherwise it ships
- Dashboard card *"Sit for the second reading."* fires when eligible

### KPI sink (B5)
- `services/events.js` with allowlist + propsJson size cap + fire-and-forget writes
- `POST /api/events` rate-limited 60/min/IP, FIFO-capped IP map (L-2 pattern reused)
- `public/track.js` (~80 LOC vanilla) with `mc.track()` + `mc.trackOnce()`, `data-event` delegation, lazy `mc_anon_id` cookie, `keepalive: true` for unload
- Wired into all 10 user-facing pages (verified including payment-confirmed post-fix)
- 36 distinct events + 6 derived metrics; **comp users (founder) excluded from KPI tile computations** so founder activity doesn't pollute funnel
- 14 admin tiles served from `GET /api/admin/funnel` (auth-gated, 60s client poll); auto-flips JSONL→Postgres backend when `DATABASE_URL` present

### Web Push (B4)
- `services/push.js` with VAPID; DRY-RUN safe when env unset
- `POST /api/lookmax/push/subscribe`, `/vapid-key`; subscriptions stored on user record, **never exposed in any GET response** (security: stripped in `publicUser()`)
- Service worker `push` + `notificationclick` → `/lookmax/mirror`
- Dashboard subscribe prompt after 3 mirrors; behind silence guarantee (localStorage dismiss flag)
- Daily 7:30 IST cron behind `MIRROR_PUSH_ENABLED=false` (default off — flip after copy + smoke)

### MP4 reveal export (B4)
- `services/video.js` detects ffmpeg at boot; degrades to 503 on missing
- `apt-get install -y ffmpeg` added to `render.yaml` buildCommand (commit `4bc4d62`) — next deploy installs it
- `POST /api/lookmax/reveal/render` enqueues; `/job/:jobId` polls. In-memory queue (single-instance OK for v1).
- Behind `REVEAL_MP4_ENABLED=false` (default off — flip after ffmpeg verified live)

### Founder dogfood layer
- `POST /api/admin/grant` — comp Aura++ access without Razorpay
- `POST /api/admin/timewarp` — adjust `lookmaxxingStartedAt` (e.g. `daysAgo: 30`)
- `POST /api/admin/simulate-reaudit` — synthetic Day-30 result for UP/FLAT/DOWN (incl. heldCount=0 path)
- `/admin` Dogfood Tools panel with one-click buttons
- `FOUNDER_DOGFOOD.md` — 207-line walkthrough

---

## 2. What is verified

| Verification | Status |
|---|---|
| `npm test` | 915/915 + 20 skipped, 0 failing |
| `npm run smoke` | 31/31 |
| `/health` reports `database: true, storage.configured: true, bucket maincharacter-lookmax` | ✓ |
| Live commit `d019389` deployed | ✓ |
| Console clean on all 8 surfaces (landing, audit, paywall, dashboard→login bounce, login, reveal-unauth-bounce, payment-confirmed, admin) | ✓ |
| Brand-voice clean: 0 fire emojis, 0 unapproved `[COPY DRAFT]` user-visible, 0 exclamations in MainCharacter's own voice (the only `!` strings are inside the `WHAT OTHER APPS SAY` contrast block on landing — by design) | ✓ |
| Gemini model swap to `gemini-2.5-flash` before 2026-06-01 cliff | ✓ (commit `4b8d968`) |
| `window.mc.track` exposed on landing + payment-confirmed (post-fix) | ✓ |
| Cross-sell card silence guarantee respects localStorage flag | ✓ via test |
| Held-count=0 DOWN-variant template drops the conditional sentence | ✓ via 8 branching tests |
| Admin password leak redacted from repo files | ✓ commit `d019389` (rotation still needed — see §4) |

**Not yet verified end-to-end (Render-only):**
- R2 round-trip script (`node scripts/verify-r2-roundtrip.js` in Render Shell)
- JSON→Postgres backfill (`node scripts/backfill-json-to-pg.js` in Render Shell)
- ffmpeg present after next deploy (verify with `which ffmpeg` in Render Shell)

---

## 3. Remaining gates to public launch

In dependency order. **Nothing below is a code blocker** — everything is operational/legal/business.

### Gate A — Founder Render-Shell verifications (~10 min)
Run, in order:
1. `node scripts/verify-r2-roundtrip.js` → must print `◆ R2 ROUND-TRIP: PASS`
2. `node scripts/backfill-json-to-pg.js` → confirm user/audit/early-access counts
3. `which ffmpeg` → must print a path (after the render.yaml deploy completes; if absent, wait for the build to finish — adds ~30s)
4. After ffmpeg confirmed: set `REVEAL_MP4_ENABLED=true` and run one test render via the dogfood account

### Gate B — Admin password rotation (URGENT, ~5 min)
The plaintext that was committed to git history must be rotated.
```bash
# In Render Shell:
node -e "console.log(require('./lib/auth').hashPassword('YOUR-NEW-PASSWORD'))"
# Paste the hash into Render env as ADMIN_PASSWORD_HASH (overwrite)
# Manual Deploy → Deploy latest commit
# Verify: POST /api/admin/login with OLD password → 401
```

### Gate C — Photo upload security hardening (security audit P1, ~2 hours dev)
Per `security/audit-production-readiness-2026-05-28.md`:
- P1-1 photo content-type + magic-byte validation in multer config (`routes/audit.js:20-23`, `routes/lookmax.js:27-30`)
- P1-2 confirm sharp's EXIF strip ran (already shipped tonight via `putPhoto` — verify by uploading a GPS-tagged photo and inspecting the R2 object)
- P1-3 per-user/IP Gemini cost ceiling (a bad actor can burn the Gemini quota with looped audits)
- P1-4 per-IP failed-login lockout on `/api/admin/login` (reuse `lookmax-auth.js:101-129` cooldown pattern)
- P1-5 verify `ADMIN_PASSWORD_HASH` and `RAZORPAY_WEBHOOK_SECRET` are set in Render env

Backend-agent ticket — these are surgical fixes. **Cannot launch publicly without them.**

### Gate D — Legal: 4 drafts → lawyer review → ship (4 weeks elapsed)
- `product/draft-privacy-policy.md` (11 founder-decision blocks)
- `product/draft-terms-of-service.md` (5 blocks)
- `product/draft-refund-policy.md` (3 blocks)
- `product/draft-consent-flow-and-age-gate.md` (3 blocks)
- `product/draft-contact-page.md` (3 blocks)

Steps:
1. **Resolve the postal address gap** (founder action — required by Razorpay live KYC, DPDPA, Consumer Protection E-Commerce Rules 2020 Rule 5)
2. Bundle all 5 drafts + send to a single Indian privacy/commercial lawyer (joint review, ~₹40K — note: legal-finance-agent flagged this as ~50% cheaper than 5 separate reviews)
3. Apply lawyer changes
4. Frontend-agent ticket: convert markdown to 4 HTML pages, wire footer Privacy/Terms/Refund links (currently `/#`), build the 4-checkbox consent gate at `/audit` entry per `draft-consent-flow-and-age-gate.md`
5. Publish

### Gate E — Razorpay live (founder action + Razorpay KYC, ~1 week)
1. Razorpay merchant KYC submission (needs the postal address from Gate D-1)
2. Razorpay live mode approval
3. In Render env: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` swap from `rzp_test_*` to `rzp_live_*`
4. **Critical:** `RAZORPAY_WEBHOOK_SECRET` must be the LIVE webhook secret (not the test one)
5. Manual redeploy
6. Smoke test: walk one founder dogfood subscribe with a real ₹799 transaction; confirm webhook fires + `oratorActive` flips + receipt sends

### Gate F — Business registration (founder + CA, separate timeline)
- Operator entity (Digit Global Services) GST registration recommended *before* crossing ₹20L services threshold (per legal-finance scale brief). At ₹799 ARPU that's ~2,500 customer-months/yr.
- Trademark filing for "MainCharacter" + ◆ mark (optional but recommended pre-launch)

### Gate G — Infra upgrades for first viral spike (per `infra/scale-readiness-2026-05-28.md`)
At current scale (1 user, founder dogfood): no action needed.
At ~500 active users (~₹4L MRR): upgrade to Render Starter ($7/mo) + Neon Launch ($5/mo) + Upstash Redis BullMQ + Sentry. **Cost: ~₹1,200/mo fixed + Gemini variable.**
At ~5K active users: tune the queue + Postgres compute tier.
At 12.5K active (₹1Cr MRR target): multi-instance Render + Postgres read replica.

**First chokepoint that breaks under traffic NOW:** Express event loop on single dyno blocks on Gemini Vision calls (~6 concurrent audits = queue, ~12 = OOM). Cannot survive a viral spike without Gate G's first migration.

### Gate H — Meta WhatsApp Cloud API live (Orator pillar, separate from Lookmaxxing launch)
Lookmaxxing pillar does NOT require WhatsApp. Orator requires it. Defer to Orator's own roadmap. CLAUDE.md landmine #5 stays as-is.

---

## 4. Launch-day flag-flip sequence

Execute in this exact order. **Each step verified before the next.** Stop and roll back on any failure.

```
Pre-flight (all gates A–E complete + lawyer-cleared legal pages live + Razorpay merchant approval)

Step 1 — Verify env state
  In Render Shell:
    node -e "const e=process.env;['DATABASE_URL','R2_BUCKET','ADMIN_PASSWORD_HASH','RAZORPAY_KEY_ID','RAZORPAY_KEY_SECRET','RAZORPAY_WEBHOOK_SECRET','GEMINI_API_KEY','GEMINI_MODEL'].forEach(k=>console.log(k+': '+(e[k]?'SET':'MISSING')))"
  Expected: all 8 SET. RAZORPAY_KEY_ID should start with 'rzp_live_'.

Step 2 — Verify hardening (Gate C done)
  curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/login \
    -d '{"password":"wrong"}' -H "Content-Type: application/json"
  Expected: 401. After 3 wrong attempts from same IP, 5-min cooldown response.

  curl -s https://maincharacter.digitglobalservices.com/health
  Expected: database:true, storage.configured:true, webhookGuard:"verified" (NOT "open")

Step 3 — Flip PAYWALL_PUBLIC
  In Render env: PAYWALL_PUBLIC=true
  Manual Deploy → Deploy latest commit
  Verify: /paywall serves the 3-card public version, not waitlist

Step 4 — Smoke a real Razorpay charge (founder card, ₹799 Orator OR ₹1,499 Lookmaxxing)
  Walk: / → /paywall → fill form → Razorpay checkout → /payment-confirmed
  Verify in /admin/funnel: paywall_to_payment_transition increments by 1
  Verify in DB: user.oratorActive (or lookmaxxingActive) = true
  Verify in email: receipt arrived
  Verify: dashboard renders with the right plan

Step 5 — Refund the test charge from Razorpay dashboard
  Verify in DB: subscription.cancelled webhook fires, user remains active until cycle end

Step 6 — (Optional, if Orator launching alongside) Flip WHATSAPP_SEND_MODE
  Confirm Meta credentials present (WHATSAPP_ACCESS_TOKEN, PHONE_NUMBER_ID, APP_SECRET)
  Test: send Welcome template to ADMIN_PHONE via /admin
  If clean: WHATSAPP_SEND_MODE=all
  If not: stay on allowlist and finish Meta setup separately

Step 7 — Flip ancillary feature flags ONLY after the founder + small allowlist have used them
  REVEAL_MP4_ENABLED=true (after Gate A step 4)
  MIRROR_PUSH_ENABLED=true (after copy review of the push body + nudge prompt)
  DPDPA_RIGHTS_ENABLED stays true (already default)

Step 8 — Announce
  Marketing-agent owns this from here.
```

### Roll-back procedure (any step fails)

```
1. In Render env: revert the flipped flag (PAYWALL_PUBLIC=false; or back to rzp_test_* keys)
2. Manual redeploy
3. Verify /paywall serves waitlist again + /health flags pre-launch state
4. Refund any test charges from Razorpay dashboard
5. Open an incident note in DECISIONS.md
```

---

## 5. Founder Render-Shell quick reference

```bash
# Sanity: which version is live + are infra creds visible
curl -s https://maincharacter.digitglobalservices.com/health | python3 -m json.tool

# Verify R2 end-to-end (round-trips a 1x1 PNG)
node scripts/verify-r2-roundtrip.js

# One-shot JSON→Postgres backfill (idempotent)
node scripts/backfill-json-to-pg.js

# Generate a new admin password hash
node -e "console.log(require('./lib/auth').hashPassword('YOUR-NEW-PW'))"

# Check ffmpeg presence post-deploy
which ffmpeg && ffmpeg -version | head -1

# Hash a string for any other secret rotation
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 6. Owners

| Concern | Owner |
|---|---|
| Render env vars (set/rotate/swap) | Founder |
| Razorpay merchant KYC + live keys | Founder |
| Lawyer engagement + 5-draft review | Founder |
| Postal address provisioning | Founder |
| Backend P1 hardening fixes | backend-agent (founder dispatches) |
| Frontend legal pages (post-lawyer) | frontend-agent (founder dispatches) |
| MP4 + push body copy approval | Founder (copy-consultant-agent drafts) |
| Marketing announcement | marketing-agent (founder dispatches) |
| First viral spike monitoring | scale-readiness-agent (founder dispatches when traffic warrants) |

---

## 7. Single biggest unfair-advantage move still on the table

Per `growth/build-tonight-competitive-spec.md`, headline: **the mirror strip** — daily selfies stacked horizontally with leverage-axis trajectory annotated under each. No competitor ships the user's actual face Day N beside Day 1 as the central daily artifact. Lookmaxxing v1 ships the precondition (R2 + retention + Day-30 reveal); the mirror strip itself is a one-week frontend build on top of that. Backlog as the first feature shipped post-launch.

---

*End. Update on every flag-flip or new gate clearance.*
