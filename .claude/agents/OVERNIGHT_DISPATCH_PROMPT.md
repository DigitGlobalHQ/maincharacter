OVERNIGHT BUILD — LOOKMAXXING "AUDIT ENGINE" (Stage 1–3). Autopilot. I'm asleep ~7h. Build everything unblocked; skip only what truly needs me and log it. Do NOT wait on me.

═══════════════════════════════════════════════
SETUP — load the team & the spec
═══════════════════════════════════════════════
1. I added 6 new agents to .claude/agents/: founder-voice-translator, strategy-orchestrator, luxury-brand-design, landing-page-conversion-architect, audit-funnel-architect, gemini-prompt-engineer. Load them alongside the existing team.
2. SOURCE OF TRUTH for all product logic, KPIs, the funnel, the resolution gate, and the scores is the file `maincharacter-pillar2-aesthetic-system.html` (the Aesthetic System doc) in the repo / my uploads. READ IT FULLY before building. Where it conflicts with older notes, the doc wins.
3. founder-voice-translator: read this whole prompt + the doc, produce the clean Stage 1–3 spec, hand to strategy-orchestrator to sequence and run.

═══════════════════════════════════════════════
LOCKED DECISIONS (do not re-litigate)
═══════════════════════════════════════════════
- Brand identity: BLACK & SILVER luxury from my logo (public/maincharacter-logo.jpeg). NO gold in the product UI — translate the doc's gold mockups to black/silver. Use the single white "light-point" from the logo as the one accent (primary CTA glow, key focus moments).
- New Lookmaxxing flow lives at /lookmaxing and becomes the primary entry. The Orator stays VISIBLE but "Coming Soon" — gated, with a waitlist; hook line "The way you sound when it matters." DISABLE all old Orator funnel routes (/start, /orator/*, /handoff) → 404 or redirect to /lookmaxing.
- Auth: Google sign-in + email magic-link. Sign-in is requested ONLY at the value-capture moment (the ₹99 / download step), never before.
- Tonight's scope = the AUDIT ENGINE only (funnel steps 01–08 in the doc). The Daily Mirror 7-day trial (Sharpness Score, daily tasks, night log, weekly weigh-in, time-lapse) is TOMORROW NIGHT — design the prompt/data contracts for it but do NOT build it.

═══════════════════════════════════════════════
WHAT TO BUILD — the Audit engine, in order
═══════════════════════════════════════════════
STAGE 1 — LANDING (/lookmaxing) [landing-page-conversion-architect + luxury-brand-design + brand-voice-guardian/copy + frontend]
- Hero: hook headline + subheading ("The room reads you before you speak" energy — final words via the copy guardian) + one primary CTA "Get Your Aura Reading".
- VIDEO: directly below the hero, a black silver-bordered 16:9 container. I will paste a YouTube link later — until then show a tasteful "Video loading…" placeholder (NEVER a broken embed). Add a clear code comment: <!-- REPLACE WITH YOUTUBE EMBED -->. When embedded: autoplay-muted, loop, minimal controls.
- "How it works" (3 cards): Upload your photo / Get your reading / Track 7 days.
- Pillar section: Lookmaxxing LIVE (→ Audit) + Orator "Coming Soon" (→ waitlist modal).
- Final CTA repeat. Footer (Privacy/Terms/Contact → # for now).
- Mobile-first at 360px; hero + CTA above the fold. Instrument: source attribution, video watch-through, scroll depth, CTA clicks.

STAGE 2 — ENTRY FORK + CALIBRATION QUIZ [audit-funnel-architect + frontend]
- After CTA: fork — [Continue as guest] and [Sign in with Google / email], EQUAL weight. Guest mints guest_id; everything writes against it.
- 5 calibration questions, presented one at a time, IMPROVED into The Consultant voice (brand-voice-guardian rewrites my draft below; keep the underlying meaning + the A/B/C/D structure):
  Q1 main goal (powerful/intense · attractive&likable · clean professional "CEO" · fix messy features)
  Q2 skin (tough/nothing bothers it · sensitive/red-itchy · oily/shiny-breakouts · dry/tight-dull)
  Q3 hair (thick&healthy · thinning/receding · already treating loss · thick-but-no-style-clue)
  Q4 sleep (not enough/always tired · ~6–7h · 8+h great)
  Q5 effort (zero soap&water · basic routine wants more · already tracks grooming&posture)
- Answers → structured context tags for scoring.

STAGE 3 — CAPTURE → FREE AUDIT → ₹99 UNLOCK → MERGE → FORK [audit-funnel-architect + gemini-prompt-engineer + frontend + backend]
- Capture: photo upload/take, guidance overlay (front-facing, neutral light, no filter), on-device quality check, encrypt at rest, used only for this user's report.
- gemini-prompt-engineer writes the report-generation prompt: inputs = 5 answers + photo; outputs = the 8 report blocks; ENFORCE the context-vs-quest rule and the safe-task library AT THE PROMPT LEVEL (see safety block below). Return structured JSON.
- FREE-RESOLUTION report (step 05): Aura Score + First-Impression Read + face-shape label + the 4 free single-word signals; everything else BLURRED (real substance behind it, unreadable). The gate is RESOLUTION, not topic.
- ₹99 UNLOCK (step 06): tapping a blurred metric or "Generate Full Report" → paywall. UPI-first, Razorpay TEST-MODE. On success: all metrics resolve + full report renders + PDF download generates (use the pdf skill). Show "₹99 credited toward month one."
- GUEST → SIGN-IN (step 07): if a guest taps pay/download, prompt sign-in THEN. Merge guest_id → user_id: answers + photo (becomes baseline) + report + purchase carry over, zero loss. Delete guest record post-merge. (This is the memory concern I raised — get it exactly right; the signed-in user's future Gemini context must include everything the guest produced.)
- PREMIUM FORK (step 08): after report (download or not) → two paths: "Start 7-Day Free Trial" or "Go Premium". The trial destination can be a clean "Stage 4 — coming" placeholder for tonight.

═══════════════════════════════════════════════
SAFETY — NON-NEGOTIABLE (enforce in code AND in prompts)
═══════════════════════════════════════════════
- CONTEXT-VS-QUEST: never score or task anything unchangeable (bone structure, hair density, colouring = context, shown not scored). Only changeable metrics earn a score+quest (skin, hairline/beard GEOMETRY, haircut match, wardrobe, posture, puffiness, hydration, sclera, under-eye state).
- SAFE-TASK LIBRARY ONLY: skincare basics, cold-water/cold-roller for puffiness, sleep hygiene, hydration, grooming/shape, posture cues, wardrobe/colour. NO medical claims, NO supplement/medication names or dosages, NO acid/retinoid strengths, NO caloric restriction / fasting / dehydration, NO procedures, NO shaming. Anything edging there → "this is one for a qualified professional," no instruction.
- gemini-prompt-engineer: produce 2–3 SAMPLE reports from real test photos+answers and put them in the morning report — I judge quality on real examples.

═══════════════════════════════════════════════
RULES
═══════════════════════════════════════════════
- Do NOT touch existing working systems (Postgres/R2 durability, the prior Daily-Mirror/reveal/Day-30 engine code, KPI infra) except as needed to wire the new funnel.
- Do NOT flip PAYWALL_PUBLIC, do NOT swap to live Razorpay keys, do NOT change WHATSAPP_SEND_MODE.
- Conventional commits tagged "stage-1-audit"; tests first; run full test suite + smoke before each commit; never break green.
- Browser-verify every surface on the live deploy (desktop + 360px mobile); screenshot each.
- SKIP-VS-STOP: if something needs ONLY me (a credential, a business decision, an external account action) → skip it, build around it (flag/stub/fallback), log under "Blocked — needs you," and keep going. Never halt the whole build for one item. The ONLY thing you stop-and-flag for is a safety concern.

═══════════════════════════════════════════════
MORNING REPORT (full — write to MORNING_REPORT.md and print)
═══════════════════════════════════════════════
1. Headline: what shipped, live commit hash, test delta, smoke status.
2. Agent-by-agent: outputs + file paths + commit hashes.
3. Screenshots: every new/changed surface, desktop + mobile.
4. "Blocked — needs you": each skipped item + why + the exact action I must take.
5. "What to test": numbered walkthrough of the full funnel (landing → quiz → photo → free report → ₹99 test-mode → merge → fork).
6. Safety: anything halted/flagged + the 2–3 sample Gemini reports.

Begin: founder-voice-translator → spec, strategy-orchestrator → sequence + run the waves. Build the Audit engine. I'll review the morning report when I wake.
