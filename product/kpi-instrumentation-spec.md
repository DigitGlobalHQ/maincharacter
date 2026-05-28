# KPI Instrumentation Spec — Lookmaxxing pillar (B5, overnight build)

> Owner: Head of Product. Date: 2026-05-28.
> Mode: BUILD SPEC. This is what backend-agent + frontend-agent implement tonight as B5 of the overnight build. Other agents (B3 competitive teardown, B4 visual layer) plug their measurements into the catalogue and tiles defined here.
> Lineage: ROADMAP_TO_1CR §NOW-0, brief-NOW-1 §4, brief-NOW-2 §4, brief-NOW-3 §4. Reads grounded in `routes/api.js`, `routes/audit.js`, `routes/lookmax.js`, `routes/admin.js`, `models/User.js`, `models/AuditSession.js`, `server.js`, `public/admin.html`.
> Constraint: Orator is dormant. This spec covers Lookmaxxing only — every event below earns its keep in the Lookmaxxing acquisition → activation → habit → retention → conversion → loss → referral loop. Orator events deliberately omitted (the seven-day WhatsApp protocol is mute until Meta approves).

---

## 0. Operating principles (read first)

1. **Every event must answer "if this number drops, which founder action does that trigger?"** If you can't write that sentence, the event is cut.
2. **Self-hosted only.** No Mixpanel, Posthog, Amplitude, GA, or Segment. Lookmaxxing carries DPDPA biometric data; we add zero new processors before lawyer review (CLAUDE.md §6, brief-NOW-1 dep §5).
3. **Fire-and-forget writes.** The event sink never blocks a response. A failed `track()` logs once and continues — never a 500.
4. **Snake_case, present-tense verbs.** `audit_started`, not `auditStarted`/`AUDIT_FIRED`. Matches the names already used in brief-NOW-1 §4 and brief-NOW-3 §4.
5. **Server-side allowlist.** A page POSTing `paywall_decimated` to `/api/events` is silently rejected. The allowlist lives next to the catalogue in `services/events.js`.
6. **No PII in `props`.** `userToken` (UUID) and `anonId` (random) only. Never phone, never email, never raw photo URLs. The PII-mask review in brief-NOW-2 §6 stands.
7. **Founder-facing tiles use Consultant voice.** Restrained, specific, no hype, no emoji but `◆`. Tile copy is admin-facing but the bar still applies (CLAUDE.md §2).
8. **DB-agnostic interface.** JSON-file today, Postgres after B0. The interface (`track()` / `trackAnonymous()`) does not change.

---

## 1. Event catalogue

Forty-two events across seven funnel stages. Every row passes the "founder action if this drops" test (see column 5).

### 1.1 Acquisition (top-of-funnel, mostly anonymous)

| Event name | Fires when | Fires where (file:line / route) | Payload (props) | Why it matters (KPI / founder action if it drops) |
|---|---|---|---|---|
| `landing_viewed` | Homepage first paint; once per anonId per session | `landing.html` (script tag added) → `POST /api/events` | `{ utm_source?, utm_medium?, utm_campaign?, referrer? }` | Top-of-funnel volume. If down → re-check ad spend / SEO / DNS. |
| `audit_started` | User taps "Begin Audit" on Scene 1 | `public/audit.html` Scene-1 button → also a server echo at `POST /api/audit/session` (`routes/audit.js:26`) | `{ sessionToken, intent?, reAudit:bool }` | Audit entry rate (`audit_started / landing_viewed`). If down → landing hook is weak; rework hero or pillar card CTA. |
| `audit_quiz_completed` | User finishes question 12, just before photo scene | `public/audit.html` end-of-quiz handler → server echo at `POST /api/audit/quiz` (`routes/audit.js:34`) | `{ sessionToken, durationSec }` | Quiz finish rate. Per-question is OUT of scope (see §5 Open Q1). If down → quiz is too long or a question is broken. |
| `audit_photos_submitted` | All required photos uploaded successfully | `POST /api/audit/photos` (`routes/audit.js:46`, end of handler) | `{ sessionToken, count, kinds:[front/side/body] }` | Photo upload completion. The single biggest funnel leak in image-heavy flows. If down → photo UX (lighting tips, fallback `<input capture>`, file size). |
| `audit_analysis_completed` | Gemini Vision returns; scores stored | `POST /api/audit/analyze` (`routes/audit.js:115` after `updateSession`) | `{ sessionToken, weakestAxis, overallScore, source }` (`source` = `gemini` or `fallback`) | Vision pipeline health. If down → check Gemini quota / API errors in `lib/log`. |
| `audit_result_viewed` | Scene-5 result paints (reveal animation starts) | `public/audit.html` Scene-5 enter | `{ sessionToken, overallScore, weakestAxis }` | Audit completion. The denominator for everything downstream. |
| `paywall_viewed` | `/paywall` page loads (waitlist OR public) | `public/paywall.html` + `public/paywall-waitlist.html` script tag | `{ sessionToken?, mode: 'waitlist'\|'public', auditEchoShown:bool, variant? }` | Audit → paywall transition (brief-NOW-1 F1). If down → recovery / token TTL. `variant` covers brief-NOW-3 Facet A. |
| `paywall_cta_clicked` | User taps a plan card's "Begin" CTA | `public/paywall.html` card-click handler | `{ plan: 'orator'\|'lookmaxxing'\|'auraplus', sessionToken?, variant? }` | Bundle attach rate (brief-NOW-3). If `plan='auraplus'` drops → tag variant is failing. |
| `recover_link_copied` | User taps "Keep this reading" → clipboard write success | `public/audit.html` Scene-6 (brief-NOW-1 F3) | `{ sessionToken }` | Brief-NOW-1 tile "Readings kept %". If down → the affordance is invisible. |
| `recover_link_shared` | User taps "Keep this reading" → `navigator.share` resolves | `public/audit.html` Scene-6 (brief-NOW-1 F3) | `{ sessionToken }` | Viral coefficient proxy. If 0 → share sheet path not firing on mobile. |

### 1.2 Activation (anonymous → identified, identified → first habit)

| Event name | Fires when | Fires where (file:line / route) | Payload (props) | Why it matters (KPI / founder action if it drops) |
|---|---|---|---|---|
| `enroll_submitted` | `/api/enroll` returns success (live OR idempotent) | `routes/api.js:43` | `{ userToken, pillar, alreadyEnrolled:bool }` | Orator enrollments. Mostly dormant — still wired so the day Orator lights up we have baseline. |
| `early_access_submitted` | Waitlist form succeeds (PAYWALL_PUBLIC=false) | `POST /api/waitlist/early-access` (`routes/api.js:458`) | `{ sourceAuditSessionToken?, hasEmail:bool, followupConsent:bool }` | Pre-launch demand signal. Tile: "Waitlist joined yesterday." |
| `payment_initiated` | `POST /api/payment/subscribe` returns a short_url | `routes/api.js:525` after `razorpay.createSubscription` | `{ userToken, planKey, amount, fromAuditSessionToken?, variant? }` | The handoff to Razorpay. If `payment_succeeded / payment_initiated < 0.5`, Razorpay UX or amount confusion. |
| `payment_succeeded` | `PAID_EVENTS` matched in webhook handler | `routes/api.js:681` (inside `processPaymentEvent`) | `{ userToken, planKey, pillars[], auraPlusPlus:bool, variant? }` | The money event. If down → Razorpay webhook signature failures (already alerted) or live-key mismatch. |
| `payment_failed` | `subscription.halted` OR `payment.failed` event arrives | `routes/api.js` (add to webhook switch) | `{ userToken, planKey, reason? }` | Card decline / mandate failure rate. If spikes → UPI Autopay friction. |
| `lookmax_first_login` | First successful auth token issued for a user | `routes/lookmax-auth.js` (post-magic-link consume / first-login exchange) | `{ userToken, method: 'firstLogin'\|'magicLink'\|'adminBypass', hoursSincePayment }` | The activation door. The single most important diagnostic for the post-payment seam (P0-1). |
| `lookmax_first_mirror_taken` | A user's first-ever mirror submit returns 200 | `POST /api/lookmax/mirror` (`routes/lookmax.js:69`); detect via `Lookmax.getMirrors(userToken).length === 1` after the write | `{ userToken, overallScore, hoursSincePayment, hoursSinceFirstLogin }` | Activation. The hours-since-payment bucket is what feeds the D1 tile. |
| `lookmax_first_mirror_within_24h` | DERIVED (no emit). Computed by query on dashboard tile. | n/a — query joins `payment_succeeded` to first `lookmax_first_mirror_taken` ≤ 86400s later | derived | D1 activation %. The single most important habit-formation signal. If down → onboarding nudge or login friction. |

### 1.3 Habit (daily ritual)

| Event name | Fires when | Fires where (file:line / route) | Payload (props) | Why it matters (KPI / founder action if it drops) |
|---|---|---|---|---|
| `mirror_taken` | Every mirror submit, after `Lookmax.addMirror` | `routes/lookmax.js:92` | `{ userToken, dayOfProgram, streakAfter, takenAtIstHour }` | Daily mirror rate. The North-Star habit metric for Lookmaxxing. |
| `mirror_score_returned` | Vision returns a score (success path) | `routes/lookmax.js:106` (right before `res.json`) | `{ userToken, overallScore, mirrorLevel, deltaVsYesterday?, deltaVsBaseline? }` | Vision health + delta distribution. If `overallScore` median collapses → scorer drift. |
| `protocol_task_completed` | A checkbox is toggled to `true` | `POST /api/lookmax/protocol/check` (`routes/lookmax.js:162`) | `{ userToken, itemId, dayOfProgram }` | Protocol engagement. If users take mirrors but skip protocol → protocol is failing as a habit. |
| `protocol_day_completed` | "Complete Day" button locks the day, streak increments | `POST /api/lookmax/protocol/complete-day` (`routes/lookmax.js:169`) | `{ userToken, streakAfter, streakIncremented:bool, completedRatio }` | Compliance rate (≥80% items checked). The proxy for whether protocols are achievable. |
| `hair_tracked` | Hair photos uploaded + scored successfully | `POST /api/lookmax/hair/photo` (`routes/lookmax.js:190`) | `{ userToken, norwood, hairlineScore, isFirstReading:bool }` | Hair-feature usage. Pull-it cadence is 6 days; if `isFirstReading=true` is high but week-2 readings are low → the hair tracker is a hook, not a habit. |
| `daily_streak_extended` | `nextStreak()` returns a value > the previous streak | `routes/lookmax.js:90` (compare before write) | `{ userToken, newStreak }` | Streak distribution. If long streaks vanish → the cron mirror nudge is broken. |
| `daily_streak_broken` | `nextStreak()` returns 1 after a previous streak ≥2 | `routes/lookmax.js:90` (compare before write) | `{ userToken, brokenAt:newStreak=1, previousStreak }` | Break-point analysis. Drives the win-back nudge spec (out of scope here, but the event is required for retention-agent to design it). |

### 1.4 Retention (returning visits, week 2+)

| Event name | Fires when | Fires where (file:line / route) | Payload (props) | Why it matters (KPI / founder action if it drops) |
|---|---|---|---|---|
| `dashboard_loaded` | `GET /api/lookmax/dashboard` returns 200 | `routes/lookmax.js:266` (end of handler) | `{ userToken, daysSincePaymentBucket: '0-1'\|'2-7'\|'8-29'\|'30-59'\|'60-89'\|'90+', streak, mirrorLevel }` | Returning-visit rate by cohort week. The cohort-survival curve is built entirely from this. |
| `reveal_watched` | `GET /api/lookmax/reveal/preview` returns `unlocked:true` AND the page reaches the final frame (frontend signals completion) | `public/lookmax/reveal.html` (end-of-slideshow handler) | `{ userToken, weekNumber, count }` | Reveal pull-through. If unlocked but unwatched → the reveal copy / placement is failing. |
| `reaudit_card_shown` | Dashboard renders the Day-30 re-audit card (eligible state) | `public/lookmax/index.html` after `GET /api/lookmax/reaudit/status` returns `eligible:true` | `{ userToken, daysSincePayment }` | Brief-NOW-2 leading metric. |
| `reaudit_started` | `POST /api/audit/session` with `reAudit:true && userToken` | `routes/audit.js:26` (branch on `reAudit`) | `{ userToken, sessionToken }` | Brief-NOW-2 leading metric. |
| `reaudit_completed` | Re-audit analyse succeeds; `reAuditResult` persisted | `POST /api/audit/analyze` (the re-audit path landing in NOW-2) | `{ userToken, deltaSign: 'up'\|'flat'\|'down', overallDelta, leverageAxisDelta }` | Brief-NOW-2 lagging metric. `deltaSign` IS the property that powers the down-delta counter-metric (the single most dangerous signal in NOW-2). |

### 1.5 Conversion (paywall + bundle pull)

| Event name | Fires when | Fires where (file:line / route) | Payload (props) | Why it matters (KPI / founder action if it drops) |
|---|---|---|---|---|
| `audit_to_paywall_transition` | DERIVED. No emit. Tile-only metric: `paywall_viewed where sessionToken matches a prior audit_result_viewed within 30min`. | n/a | derived | Brief-NOW-1 headline ("Seam: Result → Action"). |
| `paywall_to_payment_transition` | DERIVED. Tile-only: `payment_initiated within 10min of paywall_cta_clicked, same userToken or sessionToken`. | n/a | derived | Razorpay checkout abandonment proxy. |
| `bundle_attached` | `payment_succeeded` with `auraPlusPlus:true` at the moment of activation | `routes/api.js:715` (inside processPaymentEvent, when status.auraPlusPlus is true) | `{ userToken, planKey, variant?, attachPath: 'at_checkout'\|'cross_sell_upgrade' }` | Bundle attach rate (brief-NOW-3 §4). The single largest ARPU lever. |
| `cross_sell_orator_shown` | Earned-moment Aura++ card renders on Lookmaxxing dashboard | `public/lookmax/index.html` (brief-NOW-3 Facet B) → server should also stamp `user.auraCrossSellShownAt` and emit | `{ userToken, trigger: 'mirror_level'\|'re_audit', mirrorLevelFrom?, mirrorLevelTo? }` | Brief-NOW-3 leading metric. Counter-metric "re-show count must be 0" (see §1.6 below). |
| `cross_sell_orator_clicked` | User taps "Add The Orator" CTA on the earned-moment card | `public/lookmax/index.html` (brief-NOW-3) | `{ userToken, trigger }` | Cross-sell conversion. If shows are high but clicks are 0 → copy fails. |

### 1.6 Loss (cancellations, lapses, regressions)

| Event name | Fires when | Fires where (file:line / route) | Payload (props) | Why it matters (KPI / founder action if it drops) |
|---|---|---|---|---|
| `payment_cancelled` | `subscription.cancelled` OR `.halted` event arrives | `routes/api.js:739` (inside `processPaymentEvent` CANCEL branch) | `{ userToken, pillars[], daysActive, lastMirrorAgeDays? }` | Churn. If `daysActive < 30` rises → activation is failing. |
| `subscription_expired` | `subscription_status` flips from `active` to `cancelled` AND no replacement event within 7d | DERIVED via daily job (not blocking; can land week-2) | `{ userToken, daysActive }` | Voluntary churn vs involuntary (card-failure) split. |
| `dashboard_inactive_7d` | DERIVED. Computed nightly: users with `lookmaxxingActive=true` AND no `dashboard_loaded` in last 7d. | derived | `{ userToken, daysSinceLastVisit }` | Pre-churn signal. The list this generates is the input for retention-agent's win-back. |
| `cross_sell_orator_reshow` | COUNTER-METRIC. Fires only if the earned-moment card renders TWICE for the same `userToken`. | `public/lookmax/index.html` guard + server assertion | `{ userToken, trigger, reshowCount }` | Brief-NOW-3 counter-metric: this number MUST stay at 0. Any non-zero is a P0 regression. |
| `recovery_message_sent` | Single-fire follow-up email/WA actually sent (post-DPDPA gate, brief-NOW-1 F5) | `services/scheduler.js` recovery job (when NOW-1 F5 ships) | `{ userToken, channel: 'email'\|'whatsapp', followupConsent:true }` | Counter-metric: `messages_per_recovered_user` must equal exactly 1.0. >1.0 is a P0 trust regression. |

### 1.7 Referral (forward-looking — wire now, will fire when share artefacts ship)

| Event name | Fires when | Fires where (file:line / route) | Payload (props) | Why it matters (KPI / founder action if it drops) |
|---|---|---|---|---|
| `share_card_generated` | A user generates an Aura share card (audit result OR weekly reveal) | TBD when share-card ships (Backlog, post-NOW) | `{ userToken?, sessionToken?, surface: 'audit'\|'reveal' }` | Viral loop on-ramp. Wired now so when the canvas ships we don't add events under pressure. |
| `share_link_visited` | Anonymous visitor arrives at `/audit` with a `utm_source=share` tag | `landing_viewed` / `audit_started` (read `utm_source` prop) | NO new event — read from `utm_source` on existing events | Viral coefficient. The existing events suffice; no new wire-up. |

**Total events emitted from code: 36.** Plus 6 derived metrics computed at query time (not emitted): `lookmax_first_mirror_within_24h`, `audit_to_paywall_transition`, `paywall_to_payment_transition`, `subscription_expired`, `dashboard_inactive_7d`, `share_link_visited`.

---

## 2. Storage + sink

### 2.1 The single interface

A new module `services/events.js` exports exactly three functions. Backend code never reads from `data/events.jsonl` directly; everything goes through here.

```
track(name, props, userToken)            // identified user
trackAnonymous(name, props, anonId)      // pre-account / audit funnel
flush()                                   // test-only; await pending writes
```

Both `track` and `trackAnonymous` return a Promise that resolves immediately and writes asynchronously. Callers do NOT await:

```
const events = require('../services/events');
events.track('mirror_taken', { dayOfProgram: 12, streakAfter: 12, takenAtIstHour: 7 }, user.token)
  .catch(() => {}); // never throws upstream; .catch silences for the linter
```

The function signature is identical between the JSON-file backend and the Postgres backend. Migration changes the internals only.

### 2.2 Today (pre-B0): JSON-file backend

- File: `data/events.jsonl` — newline-delimited JSON. Append-only. NO truncation, NO rotation tonight (rotation is a week-2 concern).
- Format (one event per line):
  ```
  {"id":"01H...","ts":"2026-05-28T...Z","name":"mirror_taken","userToken":"abc","anonId":null,"props":{"dayOfProgram":12,...}}
  ```
- Write path: `fs.appendFile` (NOT `appendFileSync`). Failed appends log once via `lib/log` tag `EVENTS-WRITE-FAIL` and the call is dropped — the request response is never affected.
- IDs: ULID-style monotonic. If `ulid` isn't already in deps, fall back to `Date.now().toString(36) + crypto.randomBytes(6).toString('hex')`.
- Read path (admin tiles): the events module exposes `query({ name?, since?, until?, where? })` which streams the JSONL file line-by-line (`readline.createInterface`) and filters in-memory. This is fine for the first month at 10–100k events. After that, B0 (Postgres) is mandatory.

### 2.3 After B0 lands tonight: Postgres backend

Same interface; backend swaps via a feature flag.

- Table:
  ```
  CREATE TABLE events (
    id TEXT PRIMARY KEY,           -- ULID
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    name TEXT NOT NULL,
    user_id TEXT NULL,             -- userToken (UUID), nullable
    anon_id TEXT NULL,             -- random per-browser id, nullable
    props_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- one of user_id / anon_id must be set
    CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL)
  );
  CREATE INDEX events_name_ts ON events (name, ts DESC);
  CREATE INDEX events_user_ts ON events (user_id, ts DESC);
  CREATE INDEX events_anon_ts ON events (anon_id, ts DESC);
  ```
- Write path: parameterised `INSERT`. Same fire-and-forget contract — never blocks the response. If the pool errors, log once and drop.

### 2.4 Backend selection

Inside `services/events.js`:

```
const backend =
  process.env.EVENTS_BACKEND === 'postgres' || (!process.env.EVENTS_BACKEND && !!process.env.DATABASE_URL)
    ? require('./events.pg')
    : require('./events.file');
```

Default: file-backed. When `DATABASE_URL` exists (post-B0), default flips to Postgres. `EVENTS_BACKEND=file` forces JSONL for tests / rollback. **This is the only env var added by B5.**

### 2.5 Async safety contract (HARD rule)

A reviewer rejects any PR where an event write blocks a response. Specifically:
- `await events.track(...)` is banned in route handlers. The linter pattern to scan for: `await events\.(track|trackAnonymous)\(`.
- The single permitted `await events.flush()` is inside test setup/teardown only.
- All `.catch()` handlers feed into `lib/log` tag `EVENTS-WRITE-FAIL`. No `console.error`.

### 2.6 Anonymous ID

The frontend issues an `anonId` cookie OR `localStorage` value on first visit:
- Key name: `mc_anon_id`
- Value: 32-byte random hex (crypto.getRandomValues)
- Persistence: `localStorage` (survives reload, doesn't cross subdomains — acceptable for v1).
- Lifetime: until explicitly cleared. On `lookmax_first_login`, the frontend SHOULD pass `anonId` in one final identified call so the backend can stitch the pre-account funnel to the user — but no PII migration, no rewriting of past rows. Stitching is a query-time concern.

---

## 3. Frontend instrumentation pattern

### 3.1 The library — `public/track.js`

A single ~50-line script. No dependencies. Exposes one global namespace.

```
window.mc = window.mc || {};
window.mc.track = function(name, props) {
  try {
    var anonId = localStorage.getItem('mc_anon_id');
    if (!anonId) {
      anonId = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem('mc_anon_id', anonId);
    }
    var payload = {
      name: name,
      props: props || {},
      anonId: anonId,
      page: location.pathname,
      ts: Date.now()
    };
    // Use sendBeacon when available so the call survives a navigation away.
    var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', blob);
    } else {
      fetch('/api/events', { method: 'POST', body: blob, keepalive: true })
        .catch(function() {});
    }
  } catch (_) { /* swallow */ }
};
```

Rules:
- Never throws. Wraps everything in try/catch.
- Uses `sendBeacon` so leaving the page (e.g. tap `paywall_cta_clicked` → instant redirect) doesn't lose the event.
- `keepalive: true` on the fetch fallback.
- NO user PII in props ever. The linter rule: any prop key matching `/phone|email|password|token|name/i` is rejected at the server allowlist layer.

### 3.2 The endpoint — `POST /api/events` (new, in `routes/api.js`)

```
router.post('/events', eventsLimiter, (req, res) => {
  const { name, props, anonId, page } = req.body || {};
  if (!ALLOWED_EVENT_NAMES.has(name)) return res.sendStatus(204);     // silently drop bad names
  const clean = sanitizeProps(props || {});                            // strip any PII-keyed fields
  events.trackAnonymous(name, { ...clean, page }, anonId || 'unknown')
    .catch(() => {});
  res.sendStatus(204);                                                 // no body
});
```

- The allowlist `ALLOWED_EVENT_NAMES` is a `Set` declared in `services/events.js`, sourced from the catalogue in §1. The same set powers backend `track()` validation.
- `sanitizeProps` drops any key whose lowercase form matches `/phone|email|password|token|name/`. Token props that ARE legitimate (e.g. `sessionToken`) live on the server side and are stitched in by identified backend calls — the frontend never sends them in events.
- `204 No Content` is intentional: the response is information-free. Frontend doesn't need to know the result.
- The endpoint is mounted BEFORE the global `tightLimiter` so it gets its own rate limit (see §3.3) — the tightLimiter is for write-heavy auth endpoints, not for telemetry.

### 3.3 Rate limit

A dedicated `eventsLimiter` in `server.js`:

```
const eventsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,                       // 60 events / IP / minute
  standardHeaders: false,
  legacyHeaders: false,
  skip: () => false,             // never skip
  handler: (req, res) => res.sendStatus(204),   // silent reject (don't tell scrapers they're throttled)
});
app.use('/api/events', eventsLimiter);
```

60 / IP / minute is generous for normal use (a real user emits ~10–15 events per session) and tight enough that a hostile page hitting `mc.track` in a loop fills the bucket in seconds, then silently 204s.

### 3.4 Page-by-page wiring

The exact `<script>` tag added to each public page (placed in `<head>` so events fire before navigation):

```html
<script src="/track.js" defer></script>
```

Pages that need it tonight:

| Page | File | Events emitted from this page |
|---|---|---|
| Landing | `landing.html` | `landing_viewed` |
| Audit funnel | `public/audit.html` | `audit_started`, `audit_quiz_completed`, `audit_photos_submitted` (client side; server also echoes), `audit_result_viewed`, `recover_link_copied`, `recover_link_shared` |
| Paywall (public) | `public/paywall.html` | `paywall_viewed`, `paywall_cta_clicked` |
| Paywall waitlist | `public/paywall-waitlist.html` | `paywall_viewed` (mode=waitlist), `early_access_submitted` (client-side echo) |
| Payment confirmed | `public/payment-confirmed.html` | NONE from frontend — `payment_succeeded` is webhook-fired server-side. Page just polls `/api/payment/status`. |
| Lookmaxxing PWA shell | `public/lookmax/index.html` | `dashboard_loaded` (server emits; the page itself emits `cross_sell_orator_shown` + `cross_sell_orator_clicked` + `reaudit_card_shown` when those cards render) |
| Mirror | `public/lookmax/mirror.html` | NONE — `mirror_taken` + `mirror_score_returned` are server-side. |
| Protocol | `public/lookmax/protocol.html` | NONE — `protocol_task_completed` / `protocol_day_completed` are server-side. |
| Reveal | `public/lookmax/reveal.html` | `reveal_watched` |

The Service Worker (`public/lookmax/sw.js`) must NOT cache `/api/events` — add an explicit network-only rule.

### 3.5 Server-side emission (the bulk of events)

Backend emits inside the existing route handlers. Pattern, with exact insertion points referenced in §1:

```
const events = require('../services/events');
// ... existing handler ...
events.track('mirror_taken', {
  dayOfProgram: ..., streakAfter: streak, takenAtIstHour: new Date().getUTCHours() + 5 (mod 24)
}, user.token).catch(() => {});
```

Backend events ALWAYS go through `track(name, props, userToken)` — never through `/api/events`. The frontend endpoint is for the unauthenticated funnel only.

---

## 4. Admin dashboard tiles

Tonight's `public/admin.html` ships 14 tiles. Plain HTML — numbers + a tiny SVG sparkline (optional, ≤30 LOC inline). NO Chart.js for the new tiles; the existing Chart.js stays for the legacy panels.

All tile copy is in Consultant voice (admin-facing but the bar still applies): restrained, specific, no exclamations, no emoji but `◆`.

### 4.1 Tile catalogue

| Tile (Consultant voice) | Window | Source query (against `events`) | KPI it answers | Founder action if RED |
|---|---|---|---|---|
| **"Audits begun in the last 24 hours."** | rolling 24h | `count(name='audit_started', ts >= now-24h)` | Top-of-funnel volume | Check ads spend, landing uptime, traffic sources |
| **"Audit to action seam."** | rolling 7d | `count(paywall_viewed where sessionToken ∈ recent audit_result_viewed) / count(audit_result_viewed)` | Brief-NOW-1 headline (Result → Action) | Echo render broken; check audit-session TTL + `/api/audit/result` health |
| **"Echo shown on paywall."** | rolling 7d | `% of paywall_viewed where props.auditEchoShown=true` | Brief-NOW-1 leading; catches token-expiry regressions | Token TTL is 24h — audit→paywall gap too long, or the echo fetch is silently failing |
| **"Paywall to payment seam."** | rolling 7d | `count(payment_initiated) / count(paywall_cta_clicked)` | Razorpay checkout abandonment | Razorpay UX issue; check Razorpay dashboard for failed prefills |
| **"Conversions yesterday."** | yesterday (IST) | `count(payment_succeeded, ts ∈ yesterday)` | Daily revenue pulse | Razorpay webhook receiving? PAYWALL_PUBLIC still true? |
| **"ARPU, last 30 days."** | rolling 30d | `sum(payment_succeeded.props.amount) / count(distinct payment_succeeded.userToken)` | Blended ARPU (brief-NOW-3 headline) | Bundle attach falling — check tag A/B variant |
| **"Bundle attach rate."** | rolling 7d | `count(bundle_attached) / count(payment_succeeded)` | Brief-NOW-3 lagging | Aura++ tag variant losing — rotate or roll back |
| **"First mirror within 24 hours of paying."** | rolling 14d | `count(lookmax_first_mirror_taken where hoursSincePayment ≤ 24) / count(payment_succeeded)` | D1 activation — THE most important habit metric | Onboarding email cold; login is failing; PWA install prompt missing |
| **"Day-7 still mirroring."** | cohort: paid 7-14 days ago | `count(distinct userToken in mirror_taken between [7-1, 7+1] days post-payment) / count(payment_succeeded in that cohort)` | D7 retention | Daily nudge not firing; protocol too hard |
| **"Day-30 still mirroring."** | cohort: paid 30-37 days ago | as above, [30-1, 30+1] | D30 retention; pairs with re-audit | Re-audit card not showing; check NOW-2 dependency |
| **"Mirrors taken yesterday across active users."** | yesterday (IST) | `count(distinct userToken in mirror_taken yesterday) / count(distinct lookmaxxingActive=true users)` | Daily mirror rate | Cron mirror nudge broken; streak motivation gone |
| **"Reveal pull-through."** | rolling 14d | `count(reveal_watched) / count(reveal_unlocked sessions)` (the latter inferred from `GET /reveal/preview` returning unlocked, which we should log as `reveal_unlocked` — add if not present) | Whether the reveal earns its build cost | Reveal copy/placement is wrong |
| **"Re-Audit completion rate."** | rolling 14d (when NOW-2 lands) | `count(reaudit_completed) / count(reaudit_card_shown)` | Brief-NOW-2 headline | Card framing not landing; or photo-retake friction |
| **"Cross-sell silence (re-show count must be 0)."** | all-time | `count(cross_sell_orator_reshow)` | Brief-NOW-3 counter-metric | NON-ZERO IS A P0 BUG. State-loss on Postgres swap; investigate immediately |

Tile rendering rules:
- Number is the main element, in serif italic (the existing admin uses a similar treatment; reuse the `--gold` token).
- Below the number: the literal Consultant-voice sentence ("Yesterday: 47 mirrors across 53 active users.")
- A tiny gold sparkline (last 7 daily values) is OPTIONAL tonight. If skipped, leave a 16px stub div so the layout reserves space for week-2.
- Red threshold: configurable per tile, drives a thin gold-violet border. Default thresholds are spec'd in `data/admin-tile-thresholds.js` — backend-agent picks defaults that make sense from the dogfood baseline.
- No tile shows phone numbers, emails, or photo paths. Per-user drill-down is a separate week-2 view (out of scope tonight).

### 4.2 Endpoint

A single backend route `GET /api/admin/funnel` returns the full tile data set in one call. Auth: existing `requireAuth` middleware in `routes/admin.js`.

```
GET /api/admin/funnel?since=...&until=...
→ {
    auditsBegun24h: { value: 47, sparkline: [12, 18, ...], state: 'green' },
    auditToAction:  { value: 0.14, sparkline: [...], state: 'amber' },
    ...
  }
```

The admin page polls this every 60s. NO live websocket tonight (out of scope).

---

## 5. Risk + open questions

Three founder decisions needed. Defaults shipped tonight unless the founder overrides.

### Q1 — Per-question quiz events?

**Proposed default: NO. Ship `audit_quiz_completed` only.** Rationale: per-question gives 12x more events for a marginal benefit (quiz drop-off heatmap), and the audit is a known-good 5-minute commitment; we have bigger leaks (photos, paywall seam) to instrument first. **If the founder wants per-question, flip to `audit_question_answered{questionIndex, durationMs}` and the backend allowlist accepts it — but the tile catalogue does not display it tonight. Founder decision needed only if "where in the quiz do people drop?" becomes a real question this week.**

### Q2 — Identified-user stitching on `lookmax_first_login`

**Proposed default: SOFT STITCH.** On first login, the frontend includes the `anonId` in a single `events.track('lookmax_first_login', { anonId, ... }, userToken)` call. Query-time joins use this to attribute the pre-account funnel to the eventual user. **NO retroactive rewrite of anonymous rows** (would violate the append-only contract and complicate Postgres migration). **Founder decision needed only if marketing wants per-user attribution from ad click to paid sub on Day-1 — in which case we add a `mc_first_touch` row at landing and stitch through. Out of scope tonight.**

### Q3 — Storage of IP and User-Agent

**Proposed default: NO.** IP is captured by `express` for rate-limiting only and is NOT written into the event row. User-Agent is dropped. Rationale: DPDPA + biometric flow + zero new processors policy. **If the founder wants geo-bucketed funnel (e.g. North vs South India conversion), we add a coarse-grained country-only field from a single IP-to-country lookup. Founder decision needed only if international expansion experiments need it (currently dormant per CLAUDE.md §9 international-expansion-agent).**

### Risk: Render free tier ephemerality

`data/events.jsonl` is wiped on every Render redeploy (CLAUDE.md landmine #1). Until B0 lands, EVERY deploy loses the day's events. The mitigation:
- B0 (Postgres) is scheduled tonight ahead of B5 — the spec assumes it lands first.
- If B0 slips, we fall back to JSONL with the documented loss caveat, and the `EVENTS_BACKEND=file` flag stays the default.
- Hard rule: do NOT ship a tile that asserts a number is real if it could have been wiped 30 minutes ago. Every tile that shows a 7d+ window depends on Postgres being live.

### Risk: cross-sell silence guarantee

The `cross_sell_orator_reshow` event is itself a tripwire. If it ever fires, brief-NOW-3 §4 says it's a P0. The acceptance criterion: the regression test (`tests/qa-cross-sell-silence.test.js`, to be written by qa-agent) seeds a user, fires the show path twice, and asserts the second render is suppressed AND no `_reshow` event lands. This is the load-bearing assertion of the cross-sell facet.

### Kill criterion (per spec template hard rule)

If the new event sink + admin tiles do NOT surface at least one actionable funnel insight (a number that visibly changes the founder's next decision) within 14 days of B5 landing, we cut the tile that didn't earn it. The instrumentation pipeline itself stays — the tile catalogue is the load-bearing thing that must justify itself.

---

## 6. Acceptance criteria (for B5 sign-off)

- [ ] `services/events.js` exists with `track`, `trackAnonymous`, `query`, `flush` — both file and Postgres backends pass the same interface tests.
- [ ] `data/events.jsonl` writes one line per event; never blocks a response (`tests/qa-events-nonblocking.test.js` asserts route latency unchanged under event-write failure).
- [ ] `ALLOWED_EVENT_NAMES` matches §1 exactly. Server-side `POST /api/events` returns 204 to any name not in the set. Test: `tests/qa-events-allowlist.test.js`.
- [ ] `public/track.js` ships ≤80 LOC, no dependencies, uses `sendBeacon`, never throws.
- [ ] The 9 frontend page additions in §3.4 are present (script tag + identified emit points per page).
- [ ] The 14 server-side emit points in §1 are present at the exact file:line locations (or the nearest equivalent if line numbers shifted from B0 migrations).
- [ ] `GET /api/admin/funnel` returns the 14 tiles defined in §4.1.
- [ ] `public/admin.html` renders the tiles with Consultant-voice copy. No exclamations. No emoji except `◆`.
- [ ] No PII (phone, email, raw token in props, name) appears in any row in `events.jsonl` or `events` table. Test: `tests/qa-events-no-pii.test.js` runs a smoke session and greps the file/table.
- [ ] Rate limit on `/api/events`: 60/IP/min, silent 204 above. Test: `tests/qa-events-ratelimit.test.js`.
- [ ] All new events have entries in `BACKLOG.md` if their emit point is gated on a not-yet-shipped brief (NOW-1 F5, NOW-2 re-audit, NOW-3 cross-sell).
- [ ] `DECISIONS.md` entry: "B5 instrumentation: file-backed JSONL today, Postgres post-B0, same interface, anonId from localStorage, no third-party SDK."

---

## 7. Rollout plan

1. **Dogfood (tonight, immediately on merge):** founder hits landing → audit → waitlist; backend admin checks `data/events.jsonl` (or Postgres `SELECT count(*) FROM events GROUP BY name`) — confirms all 36 events fire at least once.
2. **10% (post-launch first week):** with PAYWALL_PUBLIC=true and the first 10–20 paid users, watch the four highest-stakes tiles: First-mirror-within-24h, Audit-to-action seam, Bundle attach, Cross-sell silence.
3. **100% (week 2+):** all tiles live; weekly digest (`WEEKLY_DIGEST_YYYY-MM-DD.md`) auto-includes the funnel snapshot.

---

## 8. The single most important pair to watch on Day 1 after launch

**`lookmax_first_mirror_taken` × the "First mirror within 24 hours of paying" tile.**

Reason: this is the activation-or-death event. A paying Lookmaxxing user who doesn't take a mirror in their first 24 hours has, statistically, lost the entire habit before it began — and that's the only habit the ₹1,499/mo subscription justifies. If this tile sits below 50% on the morning after launch, every other improvement is wasted effort; that one number is the choke point. The founder should set a personal alert on it before anything else.

---

*End of spec. No source files modified in producing this spec. All event names match `snake_case` present-tense convention. All tile copy is Consultant voice. Every event passes the "if this drops, founder does X" test — none are vanity metrics. The Orator pillar is intentionally absent from the catalogue: it lights up later, and its events will land in a v2 of this spec when Meta WhatsApp approves.*
