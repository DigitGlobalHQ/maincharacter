# Scale Readiness — MainCharacter, 2026-05-28

> Snapshot taken post-Night-4 → post-overnight-B-runs. Live commit `4bc4d62`.
> Architecture additions since the original SCALE_PLAN: Postgres (Neon, Singapore, free), Cloudflare R2 photo storage, KPI event sink (Postgres-backed), Web Push (VAPID), MP4 reveal composer (ffmpeg installed in container at build time, in-memory job queue).
> All pricing quoted is publicly listed by the provider as of May 2026.

---

## TL;DR

- **First chokepoint under traffic = the Express event loop on a single Render dyno**, specifically the *synchronous* Gemini Vision call inside `POST /api/audit/score` and `POST /api/lookmax/mirror`. Each call blocks 4–18s. At ~6 concurrent audits the dyno's 512 MB RAM + ~0.5 vCPU starts queueing requests; at ~12 concurrent the dyno OOM-kills.
- **Can this architecture survive the first viral spike?** No, not in its current Render-free + sync-Gemini shape. It survives ~50 simultaneous audit uploads before the dyno chokes. A single TikTok video pushing 500 simultaneous visitors will brown out audit scoring, and `/tmp` photo loss + cron death on sleep make the bleed worse. Stage 1 migration (Render Starter + async Gemini queue) is the minimum bar for a public moment.
- **Top 3 cost-sensitive subsystems as MRR grows:** (1) Gemini Vision per-mirror-per-day, (2) Neon compute hours once the audit funnel goes viral, (3) Render dyno tier once the event loop is the bottleneck. R2, Resend, Razorpay are all rounding errors at every milestone.
- **Cleanest 500-user migration path:** Render Starter ($7/mo) + Neon Launch ($5/mo min) + R2 standard (already on, billed under free tier) + BullMQ on Upstash Redis free + Sentry free + cron-job.org keep-alive removed. Total fixed infra ≈ **₹1,200/mo** ($14). Gemini variable ≈ **₹17K–25K/mo** at 500 active Lookmaxxing users.

---

## 1. Current state, plainly

| Layer | Today | Configured? |
|---|---|---|
| Web | Express 5, single Render free dyno, 512 MB RAM, ~0.5 vCPU shared, sleeps 15 min idle | yes (free) |
| Keep-alive | cron-job.org pings `/health` every 5 min | yes |
| DB | Postgres (Neon, Singapore free tier, 0.5 GB storage, 100 CU-hours/mo, scale-to-zero @ 5 min idle) | yes (free) |
| Storage | Cloudflare R2 standard (10 GB / 1M Class A / 10M Class B free) | yes, fallback to `/tmp` |
| Events | `services/events.js` Postgres-backed when DATABASE_URL set, JSONL fallback | yes |
| Push | `services/push.js` VAPID, DRY-RUN until keys set | DRY-RUN |
| Video | `services/video.js` ffmpeg + in-memory `_jobs` Map, no persistence | ffmpeg now installed (commit `4bc4d62`) |
| Scheduler | `node-cron` every minute in-process, dies with dyno sleep | yes (fragile) |
| Image proc | `sharp` (libvips) synchronous in request handler | yes |
| WhatsApp | Meta Cloud API, DRY-RUN until creds set | DRY-RUN |
| Pool | `pg.Pool` `max: 10` (lib/db.js), `max: 5` (services/events.js) | yes |
| Tests | 290 Vitest passing | yes |

**Single-process anti-patterns currently in production:**
1. Synchronous `await model.generateContent(...)` inside `POST /api/audit/score` (vision.scoreAesthetic, 3 images, 5–18s)
2. Synchronous `await model.generateContent(...)` inside `POST /api/lookmax/mirror` (vision.scoreMirror, 1 image, 2–6s)
3. Synchronous `sharp(buffer).resize(...).jpeg(...).toBuffer()` inside the upload path (200–400 ms blocking per upload)
4. In-memory `_jobs` Map for ffmpeg renders (lost on deploy, on sleep, on crash)
5. `node-cron` in-process, fires every 60s, won't fire while the dyno is asleep
6. Mirror nudges iterate `Object.values(User.getAllUsers())` every minute — O(N) DB scan with no index, fine at 100 users, bad at 5K

---

## 2. Subsystem table — OK / Strain / Breaks

All numbers assume the current single Render free dyno (512 MB RAM, ~0.5 vCPU shared) unless noted.

| Subsystem | OK at | Strain at | Breaks at | Migration trigger | Cost at trigger |
|---|---|---|---|---|---|
| **Express dyno (sync handlers)** | <50 concurrent + <3 audits/min | 50–150 concurrent OR 3–6 audits/min | >150 concurrent OR >6 simultaneous audit scores (event-loop starvation, OOM) | First viral spike OR 100 paid users active simultaneously | Render Starter $7/mo + queue work to BullMQ |
| **node-cron scheduler** | While dyno is warm (cron-job.org pinger holding it up) | Any 5-min gap in pinger | First Render redeploy mid-day OR pinger outage | 100 active paid users (missed morning is a refund event) | Render Starter (no sleep) $7/mo |
| **Photos on `/tmp`** | Single dyno, no redeploys, founder dogfood | Multiple users between deploys | Any redeploy (daily during dev) | First paid user with non-trivial photo history | R2 already wired — flip env vars (free until 10 GB) |
| **Photos on R2 (standard)** | <2,380 active users (4.2 MB ea, audit baselines + 30 mirrors + hair) | 2,380–10,000 active | >10,000 (10 GB free cap × 4.2 MB/user, then $0.015/GB-month) | Hits 8 GB total (~1,900 users); also when Class A writes exceed 1M/mo (~33 writes/user/mo at 10K users) | $1.50/mo @ 100 GB = ~24K users; $7.50/mo @ 500 GB |
| **Neon Postgres storage (0.5 GB free)** | <50 users with full history (events table dominates) | 50–250 users; events table at 0.3–0.5 GB | First 0.5 GB write that returns disk-full | Events table crosses 0.4 GB OR users table + JSONB blobs cross 0.3 GB | Neon Launch $5/mo + $0.35/GB-month = ~$5–8/mo at 500 users |
| **Neon compute (100 CU-hours/mo free, scale-to-zero)** | Idle most of the day; spikes survive | Sustained ~50 req/min keeps compute non-zero >12 h/day | Sustained traffic >12 h/day across 30 days | DAU > ~300 OR a viral spike with no scale-to-zero gap | Launch tier, $0.106/CU-hr; ~$15–40/mo at 1K DAU |
| **Cloudflare R2 Class A ops (1M/mo free)** | Up to ~33K writes/day (well within 1M/mo) | 33K–100K writes/day | >100K writes/day (3 baseline + 1 mirror + 1 hair + 1 reveal frame upload = ~10 writes/active/day means 10K active = 100K/day) | DAU > 3,000 | $4.50/M ops; at 10K DAU = $13.50/mo |
| **Cloudflare R2 Class B ops (10M/mo free)** | Up to ~330K reads/day | 330K–1M reads/day | Sustained >1M reads/day (signed-URL requests, every reveal renders 3 photos) | DAU > 30K (well beyond ₹1Cr target) | $0.36/M; negligible at 12.5K DAU |
| **Gemini 2.0 Flash text (scoring)** | Free dev key (10 RPM, 1,500 RPD) | >1,000 daily replies | >1,500 RPD on free key OR paid: cost grows linearly | 100 active Orator users replying daily | Paid: $0.10/M input, $0.40/M output — ~₹0.50/reply |
| **Gemini Vision (images)** | <100 audits/day OR <100 mirrors/day on paid key | 1K–5K mirrors/day | Rate-limit (1K RPM default paid) at sustained bursts | First viral audit moment OR 500 active Lookmaxxing DAU | ~₹3.30/mirror (3 input images + tiny output); see §3 below |
| **sharp image resize (sync)** | <2 concurrent uploads | 2–5 concurrent uploads (event-loop hiccup) | >5 concurrent (250 ms × 5 = 1.25 s blocked) | First viral upload spike | Move sharp to worker thread OR offload to client-side downscale — already partly done in audit |
| **ffmpeg MP4 (sync per job, sandboxed in async pipeline)** | <2 concurrent renders | 2–4 concurrent renders (free dyno OOM risk; libx264 is heavy) | >4 concurrent renders OR any during peak | First 100 paid Lookmax users hitting Sunday-night reveal | Background worker ($7/mo extra Render worker dyno) OR move to bandcamp pattern |
| **In-memory `_jobs` Map** | Single dyno, no deploys | Single dyno, multiple deploys/day | Multi-instance OR any redeploy mid-render | Second Render instance OR first paid user whose reveal failed silently | Redis-backed BullMQ (Upstash free → 10K commands/day) |
| **`pg.Pool` (max=10) on Neon pooler** | <300 req/min, single instance | 300–800 req/min | Multi-instance + > 1,000 concurrent transactions | Horizontal scale OR sustained 1K req/min | Tune `max` per instance, use Neon pgBouncer pooled URL |
| **Event sink (Postgres INSERT)** | <50 events/sec | 50–200 events/sec | >200 events/sec sustained without partitioning | events table > 5M rows (≈ 1 month at 10K DAU) | PARTITION BY range(ts) monthly — schema change only |
| **WhatsApp Cloud API send rate** | Tier 0 unverified: 250 / 24 h | Tier 1 verified: 1,000 unique recipients/day | Hitting tier ceiling | First marketing push beyond 250 recipients (Q1 2026 update: verified portfolios jump straight to 100K/day) | Free via Meta — push for business verification before any campaign |

---

## 3. The numbers that matter — costed scenarios

### 3.1 Gemini Vision cost per active user (Lookmaxxing)

Per the Gemini API pricing page, Gemini 2.0 Flash image *input* tokens are charged per image; published pricing breakdown:

- Input image (≤1024×1024 after `sharp` resize): ~258 tokens per image at $0.10 / 1M input tokens → ~**$0.0000258 / image input**
- Output (JSON, ~200 tokens): $0.40 / 1M output → ~$0.00008 / call
- **Total per call ≈ $0.0001–0.0004** (~₹0.01–0.03)

Per active Lookmaxxing user per month, calls to Gemini:

| Activity | Calls/user/mo | Images/call | Notes |
|---|---|---|---|
| Audit (one-time at signup) | 1 | 3 | onboarding only |
| Daily mirror | 30 | 1 | 100% adherence; realistic ~18 |
| Daily mirror Consultant-line | 30 | 0 (text-only) | second call per mirror |
| Hair tracker | 4 | 2 | 6-day cadence |
| Day-30 re-audit | 0.5 | 3 | every 30 days |
| **Total / active user / month** | ~65 calls | ~24 images | |

At ~$0.0002 per call avg → **$0.013 / user / month ≈ ₹1.10 / user / month** even at the high end.

| Users | Gemini Vision cost/mo | INR equiv |
|---|---|---|
| 100 | $1.30 | ₹110 |
| 1,000 | $13 | ₹1,100 |
| 5,000 | $65 | ₹5,500 |
| 12,500 (₹1Cr target) | $163 | ₹13,500 |

**Bottom line:** at the ₹1Cr MRR target, Gemini Vision is **₹13,500/mo total** — roughly 0.14% of revenue. **Gemini is not the cost lever.** What matters at scale is **rate limits**, not cost. See §5.

> Caveat: Gemini 2.0 Flash is deprecated June 1, 2026 — see §6 deprecation list. Move to Gemini 2.5 Flash before then; cost is similar order of magnitude.

### 3.2 Neon Postgres storage burn

Per-user storage estimate (events dominate):

| Table | Bytes/user/day | Bytes/user/year |
|---|---|---|
| `events` (15 events/day avg, ~250 B/row incl. JSONB props + index overhead) | ~3.7 KB | ~1.35 MB |
| `users` (one row, ~3 KB with JSONB scores/chronicle blobs that grow) | grows ~50 B/day | ~18 KB |
| `audit_sessions` (one row, 4 KB, but TTL 24h then purgeable) | 0 | 0 |
| **Total** | ~3.8 KB/day | ~1.37 MB/year |

> Note: the original 36 events/user/day estimate was on the high end. After tracing actual `services/events.js` callsites and the 38-event allowlist, the realistic median is closer to 15 events/active-user/day. The arithmetic is sensitive — re-measure after first 50 real users.

Free tier exhausted at: **0.5 GB ÷ 1.37 MB/user-year ≈ 365 user-years.** Practically:

- **365 active users for one year** OR
- **1,000 users for ~4.5 months** OR
- **Any single viral spike that adds 50 users × 90 days = ~6 GB written-then-deleted history**

The pessimistic "exhausted at 38 user-years" worst case in the prompt assumes 36 events × 1 KB each per user-day; that's a 4× safety margin. Realistic exhaustion is at **300–400 active users**.

### 3.3 R2 photo storage burn

Per-user steady state after 30 days: 3 audit baselines + ~22 daily mirrors (retention realistic) + 4 hair photos + 1 weekly reveal MP4 (~2 MB). Each photo post-sharp ≈ 80–250 KB (audit prompt assumed 250 KB; real measurements TBD post-dogfood).

- 30 photos × 150 KB avg = **~4.5 MB/user**
- 10 GB free / 4.5 MB = **~2,225 users** before paid tier
- Above that: **$0.015/GB/month**

| Users | GB used | Cost/mo (storage) | Class A writes/mo | Class A cost |
|---|---|---|---|---|
| 500 | 2.3 GB | free | 13K | free |
| 2,225 | 10 GB | $0 (cap) | 60K | free |
| 5,000 | 22 GB | $0.18 | 135K | free |
| 12,500 | 56 GB | $0.69 | 340K | free |
| 12,500 (with MP4 reveals @ 2 MB × 4/mo) | 156 GB | $2.19 | 388K | free |

**R2 is the cheapest line item in the whole stack at every scale.** Even at ₹1Cr MRR target, R2 is sub-$3/mo.

### 3.4 Render dyno upgrade math

| Plan | Cost | RAM | Notes |
|---|---|---|---|
| Free | $0 | 512 MB | Sleeps 15 min, kept warm fragilely. Can run ~30 RPM mixed workload. |
| Starter | $7/mo | 512 MB | No sleep, no ephemeral wipe between deploys. Same compute. |
| Standard | $25/mo | 2 GB | First tier that handles 2 concurrent audit scores comfortably. |
| Pro | $85/mo | 4 GB, 2 CPU | First tier that handles ffmpeg renders without OOM risk. |

Standard is the realistic minimum once Gemini Vision concurrency exceeds 2.

### 3.5 Hetzner self-host alternative (for the cost-conscious milestone)

- **CX22**: 2 vCPU, 4 GB RAM, 40 GB disk — **€3.79/mo (~₹345)**
- **CCX13**: 2 *dedicated* vCPU, 8 GB RAM — **€13.50/mo (~₹1,225)**

CX22 alone outperforms Render Standard ($25) at 1/7 the cost. **Migration path** (when it makes sense, not before): dokku or Caddy + systemd, deploy via git push. Don't take this on before 1K paid users; the operational cost (founder hours) exceeds the savings.

---

## 4. Three milestones — what changes, what costs money

### Milestone A — 0 to 500 active users / up to ₹4L MRR

**What's required to migrate (in order):**

1. **Provision env vars only** — no code changes, no migrations beyond what's already shipped.
   - `R2_*` (4 vars) — photos move off `/tmp` automatically (storage.js falls back when unset)
   - `WEB_PUSH_VAPID_PUBLIC` / `WEB_PUSH_VAPID_PRIVATE` — flips push from DRY-RUN to live
   - `DATABASE_URL` — already provisioned, but verify
2. **Upgrade Render to Starter ($7/mo)** — kills sleep + ephemeral disk + scheduler death problem. Single cleanest action. **Do this before the first paid user.**
3. **Remove cron-job.org keep-alive** — no longer needed once dyno doesn't sleep. Less moving parts.
4. **Enable Sentry** — `SENTRY_DSN` paste, free tier covers up to 5K errors/mo.

**What now costs money:** Render Starter $7/mo. Gemini variable ≤ $1/mo at this scale. Total ≈ **₹650/mo + Gemini variable**.

**What's still free:** Neon free (well under 0.5 GB), R2 free (well under 10 GB), VAPID push (Meta operates the push gateway), Sentry free, Razorpay (2% per txn — variable not fixed).

**Effort:** Founder ~30 min (provision R2 + VAPID + Sentry + Render upgrade button). Claude Code ~0 min (no code changes — env-only).

**Risk:** Near-zero. R2 already coded with graceful fallback. Sentry init guarded. VAPID DRY-RUN until configured.

**Rollback:** Revert Render plan to free in dashboard; unset env vars to fall back to local/dry-run.

---

### Milestone B — 500 to 5,000 active / ₹4L–40L MRR

**What's required (sequenced):**

1. **Move Gemini Vision off the request path** — async queue.
   - Upstash Redis free tier (10K commands/day at start, then $0.20/100K commands)
   - BullMQ worker process (second Render service, $7/mo, or in-process worker on Standard $25 dyno)
   - Endpoint contract: `POST /api/lookmax/mirror` returns `{jobId, status: 'processing'}` immediately; client polls `GET /api/lookmax/mirror/job/:id` OR receives a push notification when scored.
   - This is the **single biggest UX win** in the whole plan — mirror submission goes from 4-8s blocking to 200 ms response.
2. **Move ffmpeg job queue to Redis-backed BullMQ** — the in-memory `_jobs` Map (`services/video.js`) survives only single-instance + no-deploy. At 500+ paid users, Sunday-night reveal generation needs persistence. Use the same Redis as #1.
3. **Render Standard ($25/mo)** — 2 GB RAM, comfortably handles 4-8 concurrent Gemini calls during their lifetime in the queue + the request-side sharp work. Free dyno will OOM here.
4. **Neon Launch ($5/mo min, then usage)** — storage ~3–4 GB at 1K active users (events dominate). Cost ~$5–15/mo total.
5. **Cloudflare CDN in front of static assets** — already on Cloudflare via DNS proxy if enabled. Cost: free.
6. **Move sharp to a worker thread or accept it** — 200-400 ms blocking per upload on Standard tier is acceptable up to ~10 uploads/min. Don't pre-optimise.

**What now costs money:**

| Item | Cost/mo |
|---|---|
| Render Standard (web) | $25 |
| Render Starter (worker for queue) | $7 |
| Upstash Redis | $0–10 |
| Neon Launch | $5–15 |
| Sentry | free |
| R2 | free |
| Gemini Vision (5K users × 60 calls × $0.0002) | $60 |
| **Total** | **~$100–115/mo ≈ ₹8,500–10,000/mo** |

At ₹40L MRR, infra is ~0.2% of revenue. Healthy.

**Effort:** Founder ~2 hours (Upstash setup + Render service add + DNS/CDN). Claude Code ~12–16 hours (backend-agent: queue refactor, two endpoints, worker process, BullMQ Sunday-cron trigger).

**Risk during migration:** Medium.
- Async mirror flow changes the client contract — needs feature flag (`MIRROR_ASYNC=true`) and parallel paths during cutover.
- BullMQ worker can silently drop jobs if Redis credentials expire. Health check must include Redis.
- Rollback: feature flag back to sync path; Redis can be torn down without code revert.

**Required new env vars:**
- `REDIS_URL` (Upstash connection string)
- `WORKER_CONCURRENCY` (default 4)
- `MIRROR_ASYNC=true` (gradual rollout)

---

### Milestone C — 5,000 to 12,500 active / ₹40L–1Cr MRR

**What's required:**

1. **Horizontal Render web instances (2–3)** — keeps p99 latency stable as DAU grows past 5K. Render auto-loadbalances. The single `node-cron` becomes a problem: schedulers fire N× per minute. Fix:
   - Move scheduler to a dedicated single-instance worker service (`scheduler` Render service, 1 replica, $7/mo). Cron stays in-process there.
   - Alternative: BullMQ repeatable jobs (already running for Gemini queue). Cleaner; preferred.
2. **DB read replica on Neon Scale tier** ($0.222/CU-hr, max 56 CU). Spin up a read-only branch for the admin dashboard's aggregation queries — they currently scan `events` and `users` on the primary. Cost: ~$25–40/mo at this scale.
3. **Events table partitioning** — `PARTITION BY RANGE (ts)` monthly. At 5K DAU × 15 events/day × 30 days = 2.25M events/month per partition. Insert performance stays flat; old partitions can be detached + archived to R2 cheaply.
4. **Photo retention policy** — older than 90 days of daily mirrors don't need full-res. Re-encode to 80 KB or move to R2 Infrequent Access ($0.01/GB-month). Saves ~60% of storage cost above 5K users.
5. **WhatsApp messaging tier** — by Q2 2026 Meta has flattened to 100K/day for verified portfolios. Confirm portfolio is verified before launch. No quota worry for The Orator at 12.5K subs (1 message/user/day = 12.5K/day, well under 100K cap).
6. **Real observability** — Grafana Cloud free (10K series, 14-day retention) OR keep Sentry + add a Better Stack uptime monitor (free). Add a synthetic test that runs `/audit` end-to-end every 15 min.
7. **DR baseline** — Neon point-in-time recovery 7 days (Launch) or 30 days (Scale). R2 versioning enabled. Razorpay subscription state is the source of truth for billing — back up by daily JSON export to R2.

**What now costs money:**

| Item | Cost/mo |
|---|---|
| Render Standard × 2 web + 1 scheduler + 1 worker | $25×2 + $7×2 = ~$64 |
| Upstash Redis (paid for repeatable jobs) | $10–25 |
| Neon Scale (compute + storage + replica) | $40–80 |
| R2 (60 GB stdard + 100 GB IA) | $1.90 |
| Sentry Team tier (if needed) | $26 |
| Grafana Cloud / Better Stack | free |
| Gemini Vision (12.5K × 60 × $0.0002) | $150 |
| WhatsApp Cloud API | free (~12K/day, under tier cap; ~$0.005/conv business-initiated but utility category is free in India for now) |
| **Total** | **~$290–340/mo ≈ ₹24,500–29,000/mo** |

At ₹1Cr MRR, infra is **~0.3% of revenue**. The dominant cost on the *variable* side becomes Razorpay's 2% fee (₹2L/mo), which dwarfs all infra combined.

**Effort:** Founder ~4 hours (Render service planning, Cloudflare WAF rules, Razorpay backup script). Claude Code ~30–40 hours (partitioning migration, scheduler extract, photo retention worker, monitoring wiring, DR runbook).

**Risk:** Medium-high during scheduler extraction — a 24-hour gap in mirror nudges loses streaks across the user base. Run scheduler in both places simultaneously with a deduplication key (`last_nudge_sent_date`) for 48 h before cutting over.

---

## 5. Gemini rate-limit / backpressure plan

Gemini API rate limits (paid tier as of May 2026, per-key, per-model):
- Gemini 2.5 Flash: **2,000 RPM / 4M TPM / no daily cap** (Tier 1 paid)
- Gemini 2.0 Flash: same shape; deprecated June 1, 2026

At 5K active Lookmaxxing users submitting mirrors in a morning window (6:30am-10am IST = 3.5 hour window), median load is ~24 calls/min. Bursts to 200/min during the 6:30-7:00 window are likely.

**Backpressure design** (implement at Milestone B):
1. Single global `p-queue` with concurrency 8 (Gemini Vision worker pool)
2. If queue depth >100, return `{status: 'queued', estimatedSeconds: N}` to client
3. Per-user rate limit: max 3 mirror scores per 24h (already enforced by `Lookmax.mirrorForToday`)
4. RPM guard already in `vision.js` line 41-47 (`RPM_LIMIT = 10`) — **raise to 1,500** once on paid Gemini key
5. Multi-key fallback: keep two `GEMINI_API_KEY_A` / `_B` keys, round-robin on 429. Cheapest insurance.

---

## 6. Honest landmines to surface to the founder (today)

These are not migration items — they are **issues with the current code as deployed** that bite under load:

1. **Gemini 2.0 Flash shuts down June 1, 2026.** All `vision.js` + `gemini.js` `getGenerativeModel({ model: 'gemini-2.0-flash' })` calls will start failing in ~4 days from this report. Migrate to `gemini-2.5-flash` immediately. *Not* my code change to make per the prompt — but a P0 surfacing for backend-agent.
2. **`models/User.getAllUsers()` is called every 60s by the scheduler** (sendMirrorNudges + sendMirrorPushNudges). On JSON backend this re-reads the entire users.json file. On Postgres backend (if `User.js` was migrated, which I haven't verified) this is `SELECT * FROM users` every minute. At 5K users that's 5K rows scanned 1,440 times/day = **7.2M row reads/day** for no real-time reason. Refactor to `SELECT ... WHERE lookmaxxing_active = true AND mirror_reminder_time = $1` with an index.
3. **`services/video.js` `_jobs` Map is unbounded.** Every reveal request adds to it; nothing prunes it. Memory leak by design. Cap at 1,000 jobs LRU OR move to Redis (Milestone B item #2).
4. **`events.js` Postgres pool is *separate* from `lib/db.js` pool.** Two pools, each `max:5–10`, both connecting to the same Neon project. At Neon's pooled connection limit (Launch = 10K concurrent client conns via pgBouncer, but the *direct* limit is much lower) this wastes ~5 connections per instance. Consolidate.
5. **R2 signed URLs are 15-min TTL** (`storage.js` line 138). The reveal page caches the page but the `<img src>` URL expires while the user is mid-view. At 5K viewers/day this becomes a "why is my reveal broken" support ticket cluster. Move to 24h TTL OR switch to public bucket + UUID-named keys.
6. **No Razorpay webhook retry handling.** If `/api/payment/webhook` is down (deploy, OOM, network), Razorpay retries 5× over 24h then gives up. Lost subscription activations = lost MRR. Add an idempotency log table and a manual reconciliation script.

---

## 7. Load test plan (k6, when founder is ready)

When `PAYWALL_PUBLIC=true` and 50 real users exist, run the test below from a single non-Render origin to characterise the breaking point empirically. The architecture review predicts breakage at ~150 concurrent + 6 simultaneous audit scores; the test confirms.

**Three test scripts, run in this order:**

### 7.1 Baseline ramp (cheap, free Render)

```js
// k6 run --vus 5 --duration 5m baseline.js
import http from 'k6/http';
import { sleep } from 'k6';
export default function () {
  http.get('https://maincharacter.digitglobalservices.com/health');
  http.get('https://maincharacter.digitglobalservices.com/');
  http.get('https://maincharacter.digitglobalservices.com/lookmax/');
  sleep(2);
}
```
**Pass:** p95 < 800 ms. **Fail:** any 5xx OR p99 > 3 s → upgrade Render before next test.

### 7.2 Audit funnel stress

Hit `POST /api/audit/photo-upload` with 3 ~500 KB JPEGs from `tests/fixtures/`, ramping VUs 1 → 10 → 30 over 10 min. Each iteration completes the 6-scene flow (init → quiz → photos → score → reveal → diagnosis).

**Pass:** all audits complete < 30 s end-to-end at 10 VU. **Fail:** Gemini Vision call times out OR dyno OOMs → confirms the chokepoint. Move to async queue (Milestone B).

### 7.3 Mirror submission storm

Simulate the 6:30am IST wave: 200 simulated users all POST `/api/lookmax/mirror` within 10 minutes with a fixture selfie. Use a dedicated test-mode header to skip auth (already supported via `/api/admin/seed-test-user` pattern).

**Pass:** all 200 receive a score within 60 s. **Fail:** event-loop starvation, p99 > 30 s, scheduler missing its 6:30 fire → confirms scheduler-and-Gemini contention. Same Milestone B fix.

### 7.4 Payment subscribe smoke (Razorpay test mode)

POST `/api/payment/subscribe` 50× sequentially with fake user data. Verify all return valid `short_url`. **Pass:** all 50 succeed, no rate-limit response from Razorpay (their limit is 200 req/min on subscriptions). **Fail:** any 429 → cache the plan-ID lookup.

**What the test produces:** a single JSON summary + a one-page markdown `infra/load-test-{date}.md` with p50/p95/p99 per endpoint, error rate, and the actual VU count at which each endpoint cracks. Re-run after every major scale migration to verify the predicted new ceiling.

---

## 8. Sequencing recap — what to migrate when

```
NOW (founder + 4 admins, $0/mo)
  ↓ free, fragile, fine for dogfood
  
At first paid user — Stage 1 (~₹650/mo + Gemini variable)
  • Render Starter $7/mo
  • R2 env vars (already coded)
  • VAPID keys (already coded)
  • Sentry free
  • Remove cron-job.org pinger
  
At ~500 paid users — Stage 2 (~₹8,500/mo)
  • Upstash Redis + BullMQ worker
  • Render Standard for web
  • Render Starter for queue worker
  • Async Gemini Vision flow
  • Neon Launch tier
  • Move ffmpeg jobs off in-memory Map
  
At ~5,000 paid users — Stage 3 (~₹25,000/mo)
  • Horizontal Render web (2-3 instances)
  • Scheduler in dedicated single-instance service
  • Events table monthly partitioning
  • Photo retention to R2 Infrequent Access
  • Read replica on Neon Scale
  
At 12,500 paid (₹1Cr MRR target) — Stage 4 (~₹29,000/mo + Razorpay 2%)
  • Add DR runbook + status page
  • Daily DB backup to R2
  • Consider migrating off Render to Hetzner CCX23 ($30/mo dedicated) IF founder hours allow ops
  • Multi-region only if international expansion fires
```

**The rule:** every milestone earns its cost from MRR. Render Starter at $7/mo is the only justifiable spend before the first paid user. Everything else waits for revenue.

---

## 9. Coordinate with infra-cost-agent

Provider choice (Render vs Hetzner vs Railway, Neon vs Supabase, R2 vs S3) is owned by `infra-cost-agent`. This document owns the **when to migrate** decision, not the **what to migrate to**. Where I quote pricing it's for sequencing math, not provider recommendation. Render is the implicit base here because it's the live deployment; if infra-cost-agent recommends a swap at any milestone, the sequencing of *when* doesn't change much — only the dollar numbers.

---

## Sources

- [Gemini Developer API pricing — Google AI for Developers](https://ai.google.dev/gemini-api/docs/pricing)
- [Neon Pricing — neon.com](https://neon.com/pricing)
- [Cloudflare R2 Pricing — Cloudflare docs](https://developers.cloudflare.com/r2/pricing/)
- [Render Pricing — render.com](https://render.com/pricing)
- [WhatsApp Business Messaging Limits — Meta for Developers](https://developers.facebook.com/docs/whatsapp/messaging-limits/)
- [Hetzner Cloud Pricing](https://www.hetzner.com/cloud)
- [WhatsApp API 2026 Updates: Portfolio Pacing, 100K Messaging Limits — Woztell](https://woztell.com/whatsapp-api-2026-updates-pacing-limits-usernames/)
