# FOUNDER_DOGFOOD.md
## Step-by-step walkthrough — testing every feature without opening the paywall

This document is your operating guide. Read it once top-to-bottom, then follow
the numbered steps in order. The entire session takes about 40 minutes.

---

## One-time setup

**Step 1 — Log into /admin and grant yourself comp access.**

Navigate to `https://maincharacter.digitglobalservices.com/admin` and enter
your admin password (`Aurora-Mirror-2026!`). Once logged in, scroll to the
"Dogfood Tools" panel. Confirm the target email reads `digitglobal.org@gmail.com`.
Click "Grant my own access" and confirm. The result line shows your magic-link URL.

Or via curl:

```bash
curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"Aurora-Mirror-2026!"}' | grep token
# → copy the token value

curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/grant \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"digitglobal.org@gmail.com","plans":["orator","lookmaxxing"],"reason":"founder dogfood"}'
# → response includes magicLinkUrl — click that URL to land in /lookmax/ as Aura++
```

The magic-link is valid for 15 minutes. If it expires, click "Grant my own access"
again — it issues a fresh one.

**What this does.** Creates or updates your account with `oratorActive: true`,
`lookmaxxingActive: true` (Aura++ status), `comp: true`. No Razorpay transaction
is involved. Your account is excluded from KPI funnel tiles so your activity does
not inflate conversion numbers.

---

## Walking every freemium feature (no login required)

These pages are public. Open them in any browser.

| URL | What to do |
|---|---|
| `/` | Read the landing page. Check pillar cards, Aura++ section, rank ladder. |
| `/audit` | Take a real audit. Upload actual photos (front, side, full body). Gemini Vision scores all 8 axes. Note your Aura Score — this becomes your baseline. |
| `/paywall` | The paywall shows the waitlist page (PAYWALL_PUBLIC=false). To preview the 3-card layout, set `PAYWALL_PUBLIC=true` in Render env, reload, then flip it back. |

---

## Walking every paid feature (requires comp access from Step 1)

Click your magic-link first. It logs you in as a paid Aura++ user.
Then visit these URLs in order:

| URL | What to do |
|---|---|
| `/lookmax/` | Dashboard. Verify all three tiles (Mirror / Protocol / Hair) appear. Streak strip shows 7 dots. Cross-sell banner should be absent (you are Aura++). |
| `/lookmax/mirror` | Take a daily mirror. Use the camera or upload a photo. Watch the 3-beat reveal: score count-up → level + Consultant line → axis bars. |
| `/lookmax/protocol` | Check 3-5 personalised items. Check ≥80% and tap "Complete the day ◆". Observe the glow on the button at ≥80%. |
| `/lookmax/hair` | Take a hair reading (front + crown). Observe Norwood stage + density score + evidence-based recommendations. |
| `/lookmax/reveal` | The weekly reveal. Unlocks after ≥4 mirrors in the week. Shows a canvas slideshow with score trajectory. Share buttons visible. |

---

## Fast-forwarding to Day-30 Re-Audit

The re-audit card appears on the dashboard when `lookmaxxingStartedAt` is ≥30 days ago.
By default, it is set to the current timestamp when you grant comp access, so the card
will not appear yet. Use time-warp to skip ahead.

**Step 2 — Time-warp your account to Day 30.**

In the "Dogfood Tools" panel on `/admin`, click "Time-warp to Day 30" and confirm.
Or via curl (replace YOUR_TOKEN):

```bash
curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/timewarp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"digitglobal.org@gmail.com","daysAgo":30}'
```

**Step 3 — Reload `/lookmax/`.** The "Sit for the second reading." card appears on
the dashboard. Tap it to walk the re-audit funnel (same 6-scene flow as the first audit,
but now three photos are required again).

**Step 4 (optional) — Skip the re-audit funnel** and go straight to the side-by-side
reveal using a simulated result (see next section).

---

## Switching reveal variants (UP / FLAT / DOWN-held-1 / DOWN-held-0)

Each "Simulate reveal" button in the Dogfood Tools panel overwrites `reAuditResult`
on your user record with synthetic scores that produce the chosen variant.

Click a button, confirm, then navigate to `/lookmax/reveal?mode=day30` to see the
Consultant line rendered. Each click replaces the previous simulation.

**Step 3 (curl) — Simulate DOWN-held-0 reveal:**

```bash
curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/simulate-reaudit \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"digitglobal.org@gmail.com","variant":"down","heldCount":0}'
# → response includes revealUrl: /lookmax/reveal?mode=day30
```

Then open the `revealUrl`. The Consultant line reads:

> "Day 30 reads below Day 1. Read that carefully — a single photograph carries
> the lighting, the morning, and the angle as much as it carries the work, and
> thirty days against a small unknown of those conditions can read as motion that
> is not there. The axes that fell tell us the lever for the next thirty. We aim
> there. ◆ MainCharacter"

(The "The axes that held tell us the protocol held." sentence is dropped when
heldCount=0, per NOW-2 §3.4b clause 4.)

---

## The exact 3-curl sequence (cold to DOWN-held-0 reveal)

```bash
# 1. Get admin token
TOKEN=$(curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"Aurora-Mirror-2026!"}' | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['token'])")

# 2. Grant comp access — returns magicLinkUrl to land in /lookmax/
curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/grant \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"digitglobal.org@gmail.com","plans":["orator","lookmaxxing"],"reason":"founder dogfood"}'

# 3. Time-warp to Day 30
curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/timewarp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"digitglobal.org@gmail.com","daysAgo":30}'

# 4. Simulate DOWN-held-0 reveal
curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/simulate-reaudit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"digitglobal.org@gmail.com","variant":"down","heldCount":0}'
```

Then click the magic-link from step 2 and navigate to `/lookmax/reveal?mode=day30`.

---

## What is still blocked from dogfooding

| Feature | Why | Action needed |
|---|---|---|
| Real Razorpay checkout | Test keys (`rzp_test_*`); recurring payments not enabled | Razorpay support ticket (item #10 in FOUNDER_ACTIONS_THIS_WEEK.md) |
| Live WhatsApp send | `WHATSAPP_SEND_MODE=allowlist`; Meta credentials not set | Complete Meta WABA setup + set 5 env vars |
| Live email send (Resend) | `RESEND_API_KEY` not set | Set RESEND_API_KEY + verify sending domain (~30 min) |
| Live web push | `MIRROR_PUSH_ENABLED=false`; VAPID keys may not be set | Run `npx web-push generate-vapid-keys`, set env vars, flip flag |
| MP4 reveal export | `REVEAL_MP4_ENABLED=false`; ffmpeg not in Render container | Update Render Build Command to install ffmpeg |
| Permanent photo storage | `/tmp` only (volatile on Render redeploy) | Provision Cloudflare R2 bucket + set R2_* env vars |

---

## Cleaning up after dogfood

To reset your comp account (clear photos, re-audit result, streak) without
creating a new account, use the existing seed endpoint with your phone number:

```bash
curl -s -X POST https://maincharacter.digitglobalservices.com/api/admin/seed-test-user \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone":"919958533994","name":"Founder","weakestAxis":"hairDensity"}'
```

This resets the Orator + Lookmaxxing activation, clears the audit session, and
returns a fresh `loginUrl`. The comp flag (`comp: true`) is not set by this route —
if you want comp status again, run `grant` after.

---

## Admin password rotation (required before going public)

The admin password is currently `Aurora-Mirror-2026!` stored as a bcryptjs hash
in `ADMIN_PASSWORD_HASH`. This is set correctly. Do not change it until you have
a new hash ready. To generate a new hash:

```bash
node -e "console.log(require('./lib/auth').hashPassword('YOUR-NEW-PASSWORD'))"
```

Paste the output into Render env as `ADMIN_PASSWORD_HASH` and remove any plaintext
`ADMIN_PASSWORD`. The dogfood endpoints enforce a rotation check in production —
they will refuse with 403 if `NODE_ENV=production` and the password is still the
default `maincharacter2026`.

---

Length: under 300 lines. ◆ MainCharacter
