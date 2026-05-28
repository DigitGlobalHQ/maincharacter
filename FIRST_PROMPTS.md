# First Prompts — Paste Into Claude Code

After dropping the team into your maincharacter repo and running `claude`, here are the first three prompts to try. Pick one based on what you need most right now.

---

## PROMPT 1 — Make Lookmaxxing publicly launchable

Use this if your top priority is flipping `PAYWALL_PUBLIC=true` and shipping Lookmaxxing to real paying users.

```
We are pre-public-launch for Lookmaxxing. The Orator pillar is dormant until Meta WhatsApp approval. I want a complete plan to go public with Lookmaxxing only — paywall live, payments flowing, scale-ready for the first 1,000 users.

Run Pattern A from CLAUDE.md. Sequence:

1. product-audit-agent: audit the current Lookmaxxing journey end-to-end — landing, /audit, /paywall (in waitlist mode AND in paywall mode), /payment-confirmed, /lookmax/* (login, dashboard, mirror, protocol, hair, reveal). Find every P0 and P1 friction. Brand voice audit on every user-facing string. Save findings to product/audit-lookmaxxing-public-launch.md. PAUSE for my review before proceeding.

2. growth-research-agent: quick benchmark of 3-5 direct/adjacent competitors in Indian aesthetic-subscription space — pricing, funnel, channels, what they're missing. Save to growth/research-competitors-2026Q2.md. Run in parallel with step 1.

3. security-compliance-agent: pre-public-launch security audit. Focus on the .env leak landmine, secrets rotation status, Razorpay live key swap readiness, photo data lifecycle, DPDPA Privacy Policy. P0 items I must fix before going public. Save to security/audit-public-launch.md. Run in parallel with step 1.

4. After my approval of audit findings: feature-product-agent + copy-consultant-agent + design-agent produce a Public Launch Spec covering the P0 fixes, any new features required (referral mechanic? abandoned-audit recovery? exit-intent on paywall?), and the brand-voice-safe paywall copy variants. PAUSE for my scope approval.

5. backend-agent + frontend-agent ship the fixes incrementally. qa-agent signs off on each. Conventional commits, tests passing.

6. conversion-optimizer-agent sets up funnel analytics BEFORE the launch — I need to see what's converting from day one.

7. marketing-agent + growth-experiments-agent prep launch creative (Reels concepts, influencer outreach drafts) but do NOT execute spend without my approval.

Do not flip PAYWALL_PUBLIC=true. Do not swap rzp_test to rzp_live. Do not exceed ₹5,000 in any spend. These are founder-only actions.

Save a running PUBLIC_LAUNCH_STATUS.md at the repo root.
```

---

## PROMPT 2 — Plan the path to ₹1Cr MRR

Use this when you want the strategic map before tactical execution. Outputs the quarterly plan.

```
I want a complete, evidence-based plan to take MainCharacter from current state to ₹1Cr MRR. India first, global later.

Run Pattern B from CLAUDE.md. Sequence:

1. growth-research-agent: market analysis. Indian aesthetic-and-self-improvement subscription market size, growth, willingness-to-pay for young men 18-30. Competitor revenue / subscriber estimates (best evidence available). Channel cost-per-acquisition benchmarks for Indian male audiences. Pricing benchmarks. Save to growth/research-1cr-mrr-market-analysis.md.

2. conversion-optimizer-agent + retention-agent (in parallel): model the funnel needed to hit 12,500 paid subs (₹799 ARPU) or 5,000 paid subs (₹1,999 Aura++ ARPU). Required acquisition rate, audit-to-paywall conversion, paywall-to-subscription conversion, Day-30 retention, Month-3 retention. Where the funnel must perform and where it currently falls short. Save to growth/funnel-1cr-mrr-model.md.

3. infra-cost-agent + scale-readiness-agent (in parallel): cost projection at 1K, 10K, 50K paid users. Recommended provider stack at each scale. When the next infrastructure cliff hits. Save to infra/cost-and-scale-1cr-mrr.md.

4. legal-finance-agent: unit economics at ₹1Cr MRR. CAC, LTV, contribution margin. GST burden. What's the actual take-home? At what scale do we need a CA on retainer, a CFO consultant, GST registration if not done? Save to legal-finance/unit-economics-1cr-mrr.md.

5. international-expansion-agent: dormant unless I activate. Confirm criteria (India MRR ≥₹15L sustained) and stay dormant.

6. Synthesize all four outputs into a single PATH_TO_1CR.md at the repo root. Structure: quarterly milestones with targets per metric, infrastructure switches by trigger, marketing spend ramp, headcount/contractor needs (be honest if I need help). Be brutally realistic — if ₹1Cr MRR in 12 months isn't credible given current state, say so and propose a realistic timeline.

PAUSE before any agent invokes the build-side team (backend, frontend, etc.). This prompt is research and planning only.
```

---

## PROMPT 3 — Cost optimization audit

Use this if your immediate concern is hosting/storage/API spend before traffic ramps.

```
I'm on Render free tier with cron-job.org keeping it warm. JSON DB on ephemeral disk. Photos in /tmp. I want to know:

1. What this currently costs vs what it should cost
2. Where I'll get burned at scale
3. The single best infrastructure switch I should make in the next 30 days

Run:

1. infra-cost-agent: do a full cost analysis at current scale, 1K paid users, 10K paid users, 50K paid users. Compare Render Starter, Railway, Fly.io, Hetzner, AWS Lightsail, DigitalOcean for hosting; Cloudflare R2 vs S3 vs Supabase Storage for photos; Supabase vs Neon vs Render Postgres for DB; Cloudflare CDN vs Bunny vs none. Use WebSearch to verify CURRENT prices — do not cite memory. Project all costs in INR. Save to infra/cost-analysis-2026Q2.md.

2. scale-readiness-agent: which migration must happen first and at what revenue threshold. JSON→Postgres, /tmp→R2, single-instance→horizontal, sync-Gemini→queue, no-CDN→CDN, no-monitoring→Sentry. Sequence them. Save to infra/SCALE_PLAN.md.

3. security-compliance-agent: while we're touching infra, confirm secrets rotation status. The .env leak landmine in the handoff — has the founder rotated Gemini + Razorpay keys yet? If not, that's P0 before any infra work. Save to security/secrets-rotation-status.md.

4. Synthesize into INFRA_DECISIONS.md at the repo root with three sections:
   - "Do this in the next 7 days" (one item, highest ROI)
   - "Do this in the next 30 days" (2-3 items)
   - "Plan for these revenue thresholds" (timeline tied to MRR)

No code changes yet. This is decision support, not execution.
```

---

## Tips

- **Run one prompt at a time.** Don't queue all three.
- **Read every output before approving the next step.** The agents are good but not infallible.
- **When something is wrong, say so directly.** "The audit missed the cancel-flow — re-audit." The agents take direction.
- **Save outputs are real files** — these become your living docs. Treat them as such.
- **`/cost` periodically** to watch Max plan usage. Heavy multi-agent runs eat the 5-hour window.

Good luck.
