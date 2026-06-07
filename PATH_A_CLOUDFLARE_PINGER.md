# Path A — Cloudflare CDN + free pinger (no migration)

**Goal:** lower latency for India visitors *and* stop the scheduler dying when the
host sleeps — for **₹0**, keeping Render as-is. No code migration.

**What the code already does (shipped):** the daily scheduler is now triggerable over
HTTP at `GET /api/cron/tick`. An external pinger hitting it every few minutes both
**keeps the dyno awake** and **drives the daily protocol**, so messages fire even on a
host that scales-to-zero. It's idempotent (safe to call repeatedly) and gated by
`CRON_SECRET`.

You do the three dashboard steps below. I can't click these for you — they need your
Cloudflare / Render / cron-job.org accounts.

---

## Step 1 — Put Cloudflare's free CDN in front of Render (the latency win)

1. Create a free account at **cloudflare.com** → **Add a site** → enter
   `digitglobalservices.com` (the root domain). Choose the **Free** plan.
2. Cloudflare shows you **two nameservers** (e.g. `xara.ns.cloudflare.com`). Go to
   wherever the domain is registered and **replace the nameservers** with those two.
   (Propagation: minutes to a few hours.)
3. In Cloudflare → **DNS**, make sure the record for the app subdomain
   (`maincharacter`) points to your Render URL and the cloud icon is **orange
   (Proxied)** — orange = traffic flows through Cloudflare's edge/cache. Grey =
   bypassed.
4. **SSL/TLS** → set encryption mode to **Full (strict)**. (Render serves valid TLS.)
5. **Caching → Configuration** → leave defaults; static assets (CSS/images/HTML) now
   cache at the edge automatically. Optional: a Cache Rule to cache `*.css`, `*.js`,
   images aggressively.

That's the whole latency change. Nothing in the repo changes; fully reversible (flip
the cloud icon grey or revert nameservers).

> Don't proxy/cache the API: leave `/api/*` uncached. Cloudflare won't cache POSTs by
> default, so the payment/WhatsApp webhooks are unaffected — but if you add Cache
> Rules, scope them to assets only, never `/api/*` or `/health`.

---

## Step 2 — Set `CRON_SECRET` in Render

1. Render dashboard → your service → **Environment** → **Add Environment Variable**.
2. Key `CRON_SECRET`, Value: a long random string (e.g. run `openssl rand -hex 24`).
3. Save → Render redeploys. Until this is set the endpoint is open (and logs a
   warning every call); once set, only requests carrying the secret are accepted.

---

## Step 3 — Create the free pinger (cron-job.org)

1. Sign up free at **cron-job.org** → **Create cronjob**.
2. **URL:**
   `https://maincharacter.digitglobalservices.com/api/cron/tick?key=YOUR_CRON_SECRET`
   (or leave `?key=` off and instead add a request **header** `x-cron-secret:
   YOUR_CRON_SECRET` under the job's advanced settings — header is tidier and keeps the
   secret out of logs).
3. **Schedule: every 5 minutes** (`*/5 * * * *`). This both wakes the host and runs the
   schedule. (Every minute is fine too, but 5 min is plenty and gentler.)
4. Save. cron-job.org shows the response — a healthy call returns
   `{"ok":true,"ticks":N,"source":"http","at":"..."}`.

> One nuance: a 5-minute pinger means an on-the-dot 08:00 send may go out within ~5
> minutes of 08:00 (the windowed catch-up covers it), not to the exact second. That's
> fine for a daily message. Want second-precision? Set the pinger to every 1 minute.

---

## Verify it's working

- Open `https://maincharacter.digitglobalservices.com/health` and look under
  `scheduler` for **`lastHttpTickAt`** updating and **`lastTickSource: "http"`** — that
  proves the pinger is reaching the scheduler.
- In Cloudflare → **Analytics**, watch **Cached requests %** climb as assets get served
  from the edge.

## When to graduate to Path B

The moment you have paying subscribers, stop relying on a free dyno + pinger:
upgrade Render to a paid always-on instance (Singapore) or move to Fly — ~₹600/mo,
keep Cloudflare in front. Reliability on a payment + WhatsApp app is worth more than
the saving. (See DECISIONS.md, 2026-06-07.)
