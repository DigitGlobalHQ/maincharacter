# How to run MainCharacter on autopilot overnight

> This is the operator guide. You (the founder) follow this top-to-bottom once. The whole thing should take ~8 minutes. After that you go to sleep and your $100 Claude plan does the work.

---

## Before you start (one-time, ~3 min)

1. **Install Claude Code** if you haven't already. In a terminal:
   ```
   npm install -g @anthropic-ai/claude-code
   ```
   Or use VS Code's "Claude Code" extension from the Marketplace.

2. **Log in** with your Claude account (the one with the $100 Max plan):
   ```
   claude
   ```
   Follow the OAuth prompt. You only do this once.

3. **Open VS Code** to your `MainComponent` folder. (You can also use Cursor or any editor — Claude Code is its own thing, the editor is just for your eyes.)

---

## The five files in this folder (already created for you)

| File | What it does |
|---|---|
| `CLAUDE.md` | Auto-read by Claude Code every session. The product context, brand voice, architecture, rules. Don't edit unless architecture changes. |
| `AUTOPILOT_PROMPT.md` | The Master Prompt. You paste the section between `===== BEGIN PASTE =====` and `===== END PASTE =====` into Claude Code as your first message. |
| `BACKLOG.md` | Claude creates this on first run. It will hold "founder actions required" — things only you can do (rotating keys, KYC, etc). Check it in the morning. |
| `DECISIONS.md` | Claude creates this on first run. Every non-obvious choice gets logged here. Read it in the morning to understand what changed and why. |
| `PROGRESS.log` | One line per task completed, with timestamps. This is your audit trail. |

---

## The launch (5 min total)

### Step 1 — open Claude Code in the project folder

In VS Code's integrated terminal (`Ctrl+\`` to open it):
```
cd ~/Desktop/MainComponent
claude
```

You should see a Claude Code prompt.

### Step 2 — give it permissions to run unattended

Type (or just paste):
```
/permissions
```
Set the following to **allow** (so Claude doesn't pause every 30 seconds asking):
- `Bash(*)` — allow all bash
- `Edit(*)` — allow all edits
- `Write(*)` — allow all writes
- `Read(*)` — allow all reads

Then **save**.

### Step 3 — open `AUTOPILOT_PROMPT.md` in VS Code, select everything between `===== BEGIN PASTE =====` and `===== END PASTE =====`, copy it.

### Step 4 — paste into the Claude Code terminal and hit Enter.

You will immediately see Claude:
1. Read `CLAUDE.md`.
2. Create `BACKLOG.md`, `DECISIONS.md`, `PROGRESS.log`.
3. Start working on P0.1, then P0.2, then P0.3, all the way through.

### Step 5 — confirm it's actually moving, then walk away.

Wait ~3 minutes. You should see:
- File edits flying by.
- `git commit` calls.
- A `PROGRESS.log` filling up.

If you see Claude **asking for permission** repeatedly, you missed Step 2. Open `/permissions` and allow the tools, then say "continue, autopilot mode, do not ask permission again" in chat.

If you see Claude **stuck on a TRUE BLOCKER** (e.g. "I need the DATABASE_URL"), it will tell you and stop. That's expected — note it for the morning, leave Claude running so it can do everything else.

Close your laptop (or leave it open with the lid on — make sure it's plugged in and **prevent sleep**: `caffeinate -dis` on macOS keeps the machine awake until you Ctrl-C it the next morning).

---

## In the morning (5 min review)

1. **Open `PROGRESS.log`** — read the timestamps. Did it finish through P3? P4? P5?

2. **Run `git log --oneline | head -50`** — see the commits. Each one should be a small, focused change with a Conventional Commits prefix.

3. **Open `BACKLOG.md`** → look at "FOUNDER ACTIONS REQUIRED". Do those next, in this order:
   - Rotate the Gemini, Wati, and Razorpay keys that were committed.
   - Create Supabase (free tier) → copy `DATABASE_URL` → paste into Render env.
   - Create Sentry → copy DSN → paste into Render env.
   - Create Resend → copy `RESEND_API_KEY` → paste into Render env.
   - Configure `cron-job.org` to ping `https://maincharacter.digitglobalservices.com/health` every 5 minutes.
   - In Render → upgrade web service to Starter ($7/mo) so it stops sleeping.

4. **Read `DECISIONS.md`** — every non-obvious choice is there. If you disagree with any, reply in Claude Code with a one-liner like "revisit the auth decision — I want session cookies, not JWT" and it will fix it.

5. **Run the smoke test against live:**
   ```
   curl https://maincharacter.digitglobalservices.com/health | jq
   ```
   You want `status: healthy` and every `config.*` field that you've set keys for to be `true`.

6. **End-to-end test as a real user:**
   - Visit the landing page on your phone.
   - Click "Start Free Trial".
   - Submit with your own WhatsApp number.
   - Within 60 seconds you should get the welcome message.
   - Reply `START NOW`. Day 1 should arrive.
   - Reply with any sentence. You should get a score within a minute.

If anything breaks, take a screenshot, paste it back into Claude Code with "fix this", and let it iterate.

---

## What to expect realistically

- **By morning**: P0, P1, and most of P2 finished. That's secrets + database + webhooks + admin auth + Razorpay subscriptions + funnel events. This alone takes you from "demo" to "production-grade."
- **What probably won't be finished tonight**: voice-note transcription (P3.1), multi-week content (P3.4), and timezone support (P3.5). These need a second night.
- **What's truly impossible overnight**: Meta Business verification, Razorpay live KYC, Wati template approval. Those are humans-in-the-loop and take 24-72h. Start them today, don't wait.

---

## If you want to scale to ₹1Cr MRR, here is the honest 30-day plan

| Week | Focus | Outcome |
|---|---|---|
| Week 1 | Finish P0-P5 above + the founder actions in `BACKLOG.md`. Start paid Meta + Google ads to landing. Hand-onboard the first 50 users. | 50 enrolments, 5-10 paid. ₹4-8k MRR. |
| Week 2 | Wire voice notes, multi-week content, referral programme. Iterate ad creative. Add testimonials from Week-1 finishers. | 500 enrolments, 50 paid. ₹40k MRR. |
| Week 3 | Launch Aesthetic pillar (the audit prototype already exists). Add a second price point (₹1,499 Sovereign). Influencer seeding. | 2,000 enrolments, 200 paid. ₹1.6L MRR. |
| Week 4 | Launch Sage pillar. Bundle pricing (all three pillars ₹1,999). Affiliate programme. | 8,000 enrolments, 1,200 paid. ₹10L MRR. |

To clear ₹1Cr MRR you need ~12,500 active subscribers at ₹799 ARPU, or ~6,600 at ₹1,499 ARPU. That's a Month-2 number, not a Day-30 number, **unless** you nail one of these:
- A viral creator drops you a video (10% chance per pitch, pitch 30).
- The Aesthetic Audit becomes a TikTok loop (very plausible — that prototype is shareable).
- You hit a corporate B2B angle (sales coaches, MBA prep, sales orgs at ₹2-5L/yr each).

The product is good. The bottleneck is distribution. After the autopilot run, your time should go 80% into distribution, 20% into product.

---

## Emergency commands

If Claude is going off the rails:
- `/clear` — wipe context, start fresh (but keep the codebase changes).
- Type `STOP. Revert your last commit. Re-read CLAUDE.md section 6. Restart from the last passing test.`
- `git reset --hard HEAD~1` in a separate terminal if Claude committed something destructive.

If you want it to stop and wait for you:
- Type `pause — wait for my next instruction.` It will.

---

That's it. Run it. Go to sleep. Trust the process.
