# MainCharacter — Visual-System Audit & Elevation Direction

**Author:** Design Director (brand/visual)
**Date:** 2026-06-02
**Status:** SPEC FOR FOUNDER APPROVAL — no code shipped. Proposes changes to tokens/type/graphics that CLAUDE.md §2 normally locks; founder explicitly authorized reconsidering the visual identity ("looks AI vibe-coded, make it professional/bold/startup-grade, next level").
**Scope:** the live website surfaces — `landing.html`, `/lookmaxing/*` funnel, `/lookmax/*` PWA dashboard, `paywall.html`. Logic and copy unchanged; this is about how it LOOKS.

---

## TL;DR (read this first)

1. **The site runs three visual systems, not one.** The funnel (`/lookmaxing/*`) is a disciplined black/silver system. The PWA dashboard (`/lookmax/*`) and the legacy Orator report (`paywall.html`) are a gold-on-obsidian system. The landing page (`landing.html`) is a *third, half-migrated hybrid*: its tokens were renamed to silver but its background glow, accent rules and one feature box still carry gold/aubergine warmth. A user crossing landing → funnel → dashboard sees the brand change clothes twice.
2. **The logo settles the gold-vs-silver question by itself.** `public/maincharacter-logo.jpeg` is a brushed-**silver** M-monogram with a single luminous **white** light-point on pure black. There is **no gold in the actual brand mark.** Every gold surface on the site contradicts the logo. The direction is therefore not a coin-toss: **unify on black/silver + the white light-point. Retire gold.**
3. **The funnel system (`tokens.css`) is already 80% of the right answer** — a real type scale, JetBrains Mono for data, the light-point motif, a 4px spacing grid, sharp radii. The elevation move is largely: *promote the funnel's discipline to the whole site, finish removing gold/aubergine, and add the few craft signals that separate "clean dark template" from "designed instrument."*
4. **The single biggest "AI vibe-coded" tell is incoherence, not any one bad screen.** Fixing the cross-surface split is the highest perceived-quality lift available, and most of it is find-and-replace + one shared stylesheet, not a redesign.

---

# PART A — AUDIT (prioritized findings, with evidence)

Severity: **P0** = actively breaks the premium promise / a stranger notices in 3s · **P1** = erodes craft, noticed on scroll · **P2** = polish.

---

## P0 — The three-system color split

**The seam, concretely:**

| Surface | File | System | Accent token | Evidence |
|---|---|---|---|---|
| Landing | `landing.html` | **Hybrid** (silver tokens, gold/aubergine residue) | `--gold: #c6c6cf` (renamed to silver) **but** body glow is aubergine | `landing.html:31` (`--gold` reassigned to silver), `landing.html:79-82` (body bg is `rgba(138,79,168,0.18)` aubergine), `landing.html:1347` (Aura++ box uses warm `box-shadow rgba(255,255,255,.08)` on a `--gold` border that is now silver — internally inconsistent) |
| Funnel | `/lookmaxing/index, start, quiz, audit, fork, full` | **Black/Silver** (cleanest) but tokens.css *itself* re-injects gold | `tokens.css:8` header says "BLACK & SILVER, no gold" — yet `tokens.css:51-54` defines `--mc-gold: #e8b84b` and `tokens.css:259, 271-273` make the **primary CTA gold-outline + gold glow** | 
| PWA dashboard | `/lookmax/index, mirror, reveal, hair` | **Full Gold** | `--gold: #e8b84b` | `public/lookmax/app.css:10`, score numeral gold (`app.css:81`), every chart stroke gold (`lookmax/index.html:1013,1022,1029`), aubergine pillar accent `--aesthetic #b06fd8` (`app.css:13`) |
| Legacy Orator report | `paywall.html` | **Full Gold + 3 pillar hues** | `--gold #e8b84b`, `--orator #f0a500`, `--aesthetic #b06fd8`, `--sage #3dbfa0` | `paywall.html:27-35` |

**Why it's P0:** the user's actual journey is `landing (hybrid) → /lookmaxing/start (silver) → quiz (silver) → audit (silver, but gold CTA) → /lookmax dashboard (full gold)`. The accent color of the brand — the single most memorable visual attribute — changes from silver to gold mid-funnel, at the exact moment the user becomes a paying customer. The dashboard, which is the product they pay for, looks like a different company than the landing page that sold it. **This is the #1 reason the site reads as assembled-by-AI rather than designed: nothing agrees with anything.**

**The contradiction inside `tokens.css`:** the file's own comment (line 8) declares "BLACK & SILVER, no gold," then a later comment (lines 44-47, "funnel-repair P3") re-introduces gold "used sparingly" for the CTA. So even the supposedly-clean system is at war with itself. The primary CTA — the single most important pixel for conversion — is gold-outlined (`tokens.css:259`) while sitting in a silver world. That's not "one accent used sparingly," that's a fourth opinion.

---

## P0 — The logo is silver; the product is gold

`public/maincharacter-logo.jpeg` (1254×1254): a vertically-brushed **silver** M-monogram, a single bright **white** dot of light at the apex, pure-black field, wide-tracked `MAINCHARACTER` wordmark. Cool, architectural, expensive. **Zero gold.**

The landing nav, the dashboard, and the Orator report all sit a gold palette directly beside this silver logo (`landing.html:1166` places the logo in a nav whose CTA — was — gold; `lookmax` dashboard pairs the silver logo with gold everywhere). A premium brand's logo and its UI accent being different colors is the kind of mismatch luxury houses never ship. **The logo is the founder-locked identity; the UI should match the logo, not the other way around.** This is the cleanest possible argument for retiring gold.

---

## P1 — Typography: a good scale exists but only the funnel uses it

- **The funnel got it right.** `tokens.css:84-100` defines a real, mobile-first type scale (display 56px → eyebrow 11px), three roles (Cormorant serif display, Sora body, JetBrains Mono data), and letter-spacing tiers for small-caps. This is genuinely good and reads premium.
- **Landing and dashboard do not use it.** `landing.html` has ad-hoc `clamp()` font-sizes scattered inline (e.g. the Aura++ box at `landing.html:1351` hard-codes `font-size:1.6rem` inline; the price line `landing.html:1367` hard-codes `0.9rem`). The PWA dashboard hard-codes sizes in `app.css` (`h1` clamp at `app.css:39`, `score-big: 6rem` at `app.css:81`) with **no mono role at all** — data and scores are rendered in the serif, which kills the "instrument / measured" feeling that mono gives the funnel.
- **No display-italic discipline.** Cormorant italic is the brand's emotional voice. The funnel uses it well (`.mc-serif--italic`). The dashboard uses italic for *everything* serif (`app.css:38-40, 61, 81` all `font-style: italic`), so the italic stops meaning "this is the emotional beat" and becomes wallpaper. **Italic should be rationed.**
- **Cormorant Garamond at small sizes on Android is a legibility risk.** It's a high-contrast display face; below ~18px on a mid-range Android LCD the thin strokes break up. The funnel mostly keeps it large (good). Anywhere it's used for body-length text it should be reconsidered.

---

## P1 — Color craft: glows are doing the work that structure should

- **Glow overuse reads as "default dark SaaS," not luxury.** Restraint is the brand's whole thesis (The Consultant), yet there are radial glows stacked on the hero (`landing.html:315-325`), behind every pillar card (`landing.html:517-535`), on the paywall section (`landing.html:753-763`), the CTA close (`landing.html:1047-1057`), and a second aubergine glow layered into the dashboard background (`app.css:30-33` stacks an aubergine radial AND a gold radial). Luxury references (Aesop, Bottega, Patek) signal value through **negative space and precise type**, almost never through ambient glow. Right now glow is the primary "premium" device, and it's the most generic one.
- **Aubergine has no job.** `--aesthetic #b06fd8` / aubergine glow is a holdover from the old 3-pillar color coding (orator-gold / aesthetic-violet / sage-teal). With Lookmaxxing as the launch product and the others deferred, the violet is a stray hue that appears as a background wash (`app.css:31`) and a "do not" card border (`app.css:100`). It dilutes a palette that should be black + silver + one white light-point, full stop.
- **Silver-on-black contrast needs an explicit audit.** `--mc-silver-dim #8a8a8a` on `--mc-near-black #0a0a0a` ≈ 4.6:1 — passes AA for large text, **fails for body** (`tokens.css:29` used as `.mc-eyebrow` color is fine because it's a label, but `--mc-silver-faint #5a5a5a` ≈ 2.3:1 is below AA and is used for sub-text e.g. `audit.html:178`). On a sunlit mid-range Android screen this is the difference between "refined" and "I can't read it."

---

## P1 — Graphics / UI craft: the "designed vs generated" signals

- **The logo is used as a cropped JPEG, not a crisp asset.** Every nav crops the square JPEG (`landing.html:1166` `object-position: center 34%`, repeated in funnel navs). It's a raster on a pure-black field, so it *mostly* hides its seams, but at 2x DPR the silver M is slightly soft, and it can never animate or recolor. **A premium brand ships its monogram as SVG.** The light-point especially should be a live SVG element so it can carry the signature glow into the UI.
- **The score / Aura visualization is the product's hero moment and it's under-designed.** Funnel renders the score as silver-gradient numerals (`audit.html:67-80`) — good. But the dashboard renders the same concept in gold serif (`app.css:81`) with a thin polyline chart (`lookmax/index.html:1013`) that looks like a default charting library. There's no consistent "score object" across surfaces. The Aesthetic-System doc's rings/KPI-bars concept (referenced in the role brief) is not realized anywhere as a distinctive, ownable graphic.
- **Iconography is inconsistent.** The brand mark is the `◆` diamond (used well: `landing.html:1518`, funnel footers). But the dashboard bottom-nav uses emoji-style glyphs (`app.css:112` `.ic`), and the landing uses raw arrow characters `→ ↓ ✕` as UI. Mixing a refined `◆` system with emoji/text-arrows is a classic AI-assembly tell.
- **Empty/loading states are uneven.** The funnel has genuinely good ones (skeleton shimmer `audit.html:43-59`, hidden-until-configured video `lookmaxing/index.html:360`). The dashboard and landing have none of this discipline.
- **Motion is mostly fine but occasionally salesy.** The funnel's staggered fade-ups (`lookmaxing/index.html:307-315`) and breathing light-point (`tokens.css:349-365`) are tasteful and on-brand. But the dashboard's `card--pulse` gold box-shadow pulse (`app.css:59-60`) is exactly the "aggressive, attention-grabbing animation" the brand voice forbids.

---

## P1 — Content / visual hierarchy

- **The landing hero is type-only and under-powered for a 3-second verdict.** `landing.html:1181-1191`: eyebrow pill + uppercase Cormorant headline + sub + two buttons, centered, over a glow. It's clean but generic — it could be any dark startup. There is **no hero image, no product glimpse, no logo presence at scale, no light-point as a focal event.** The one truly ownable asset (the M-monogram with its light-point) appears only 26px wide in the nav. The brand's most distinctive visual is hidden at the exact moment it should be making the first impression.
- **CTA prominence is muddled by the gold/silver fight.** On landing the primary CTA was gold-filled (now silver-ish), the funnel's is gold-outlined, the dashboard's is gold-glow. Three different "primary button" treatments across three surfaces. A stranger can't learn the system because there isn't one.
- **No social proof anywhere.** Zero testimonials, counts, logos, or credibility markers on landing or funnel. For a paid ₹799–1,999/mo product targeting a skeptical Indian audience, the absence of *any* trust signal is a conversion and a premium-perception gap. (Luxury does this with restraint — a single number, a single quote — not a wall of stars.)

---

## P2 — Mobile polish (360–430px, the real audience)

- Funnel is mobile-first and solid (`tokens.css` scale steps up at 768/1024). Good.
- Landing has had phone fixes bolted on (`landing.html:287-297`) but they're patches over a desktop-first layout, not a mobile-first system — the nav wordmark *disappears entirely* below 360px (`landing.html:296`), which is a fallback, not a design.
- Dashboard `app.css` is phone-width-first (`max-width:560px`, `app.css:36`) — fine — but the bottom-nav emoji + 10px labels (`app.css:111`) feel like a generic PWA template, not a premium instrument.
- Touch targets: funnel respects 44–48px minimums (`tokens.css:253, 308`). Dashboard buttons are 13px padding (`app.css:64`) ≈ borderline; the checklist checkbox is 22px (`app.css:94`) — **below the 44px touch minimum.**

---

# PART B — ELEVATION DIRECTION (one unified system)

**The decision: one system — "Obsidian & Silver, lit by a single point." Retire gold entirely. Promote the funnel's `tokens.css` to the sitewide source of truth. Make the light-point the brand's signature graphic, not a decoration.**

This is bold *through restraint*, which is the only kind of bold that matches The Consultant. The reference set is Aesop / Bottega Veneta / Apple (AirPods Pro page) / Linear / Vercel — all of which signal premium with negative space, one disciplined accent, and type, not with ornament.

---

## B1. The decision on gold vs silver vs both

**Black / Silver, with the white light-point as the only "accent." Gold is removed.**

Rationale, in order of weight:
1. **The logo is silver + white light-point. The UI must match the logo.** (Founder-locked identity argument — this is the safest possible change because it makes the site *more* faithful to the locked mark, not less.)
2. Silver/white on black is colder, more architectural, more "expensive instrument" — it suits The Consultant's restraint better than gold, which trends "crypto / hustle / awards-badge" in the Indian market and undercuts the anti-hype voice.
3. It collapses three systems into one with mostly mechanical edits.

**Roles (this is the whole accent system — there is nothing else):**
- **Black** (`#000000` / `#0a0a0a`) — the field. The default. Most of every screen.
- **Silver** — the brushed gradient `#e8e8e8 → #c0c0c0 → #8a8a8a`. Borders, the M-monogram, score numerals, headlines. This is "structure and authority."
- **White** `#ffffff` — highlights and the one primary action.
- **The light-point** — a single soft white glow (`rgba(255,255,255, .18–.55)`), echoing the logo's dot. Used **once per screen**, on the primary CTA or the single most important focus moment. This is the brand's signature; its scarcity is what makes it read as luxury rather than as glow-spam.
- **No gold. No aubergine. No pillar hues.** When the Orator and Sage relaunch, they are differentiated by *typography and label*, not by color — the palette stays monochrome. (One restrained exception permitted: a desaturated cool status-red `#d94a4a` for errors only, already in `tokens.css:76`.)

---

## B2. One type system, applied everywhere

Adopt the funnel's scale (`tokens.css:84-100`) as sitewide law. Three roles, ruthlessly:

- **Cormorant Garamond** — display only. Headlines, the one-line emotional beats, score-context lines. **Italic is rationed** to genuine emotional moments (a verdict line, a reveal), never for labels or running text. Minimum size ~20px on dark.
- **Sora** — all body, all UI, all running text. Weight 300 for body, 500 for small-caps labels. Never italic.
- **JetBrains Mono** — all data: scores' "out of 100", deltas, ranks, audit IDs, metric ticks, chart labels. **This is the single biggest upgrade for the dashboard**, which currently renders data in serif and loses the instrument feel. Mono = "measured, precise, trustworthy."

Letter-spacing tiers (already in tokens): tight for serif display, wide `.16em` for small-caps labels, x-wide `.28em` for eyebrows/monogram. Keep.

Type as luxury signal: bigger jumps between levels, more air, fewer sizes. Cut every inline `font-size` on landing and dashboard; route through the scale.

---

## B3. Graphic language (what makes it "designed")

1. **Ship the monogram as SVG, with a live light-point.** Recreate the M + apex dot as inline SVG so it can scale crisply, sit at hero scale on the landing, and let the dot carry the breathing glow (`tokens.css:349` already animates this). The light-point becomes a recurring character: it sits on the logo, it's the glow on the primary CTA, it marks the active nav item, it punctuates the score reveal. **One motif, threaded through the whole experience.** This is the difference between a logo and a brand.
2. **One "score object," used on every surface.** Design a single canonical Aura/score graphic — large silver-gradient numeral, mono "/ 100", a thin silver ring or hairline arc, the light-point marking the current value. Use the *same* object on the audit reading (`audit.html`), the dashboard (`/lookmax`), and any report. Today they're three different treatments. (This realizes the Aesthetic-System doc's "rings/KPI-bars," re-skinned silver.)
3. **Hairlines over glows.** Lead with 1px silver hairlines (`--mc-line` family) for structure — section rules, card edges, dividers — the way the funnel already does (`audit.html:113` section-label lines). Demote ambient radial glows to *at most one* soft top-down glow per page, echoing the logo's single light source from above. Delete the stacked card-glows and the second aubergine wash.
4. **One icon system.** Standardize on the `◆` mark + a small set of hairline SVG glyphs drawn in the same 1px silver stroke as the Google glyph already in `start.html:227-232`. **Remove emoji glyphs** from the dashboard nav (`app.css:112`). Arrows: one consistent character/treatment, not a mix of `→ ↓ ✕`.
5. **Texture, barely.** Keep the fine grain overlay (`landing.html:104-115`) at ~3% — it adds the "physical, expensive print" feel — but apply it *consistently* across all surfaces (the funnel currently has none). One subtle texture, everywhere, is craft; texture on some pages only is incoherence.

---

## B4. Motion principles

- **One orchestrated page-load reveal per screen** (staggered fade-up, already in the funnel `lookmaxing/index.html:307-315`), then near-stillness. Delight from arrival, not from constant micro-motion.
- **The light-point breathes; nothing else pulses.** Keep `mcLightPointBreath` (`tokens.css:349`) on the one primary CTA. **Delete `card--pulse`** (`app.css:59`) and any attention-grabbing loops — they violate the anti-hype voice.
- **Transitions: 160/280/520ms, `cubic-bezier(0.16,1,0.3,1)`** (already in tokens). Calm, decelerating, expensive.
- **`prefers-reduced-motion` honored everywhere** (funnel already does, `tokens.css:469`; extend to landing + dashboard).

---

## B5. Component standards (one set, sitewide)

Promote `tokens.css` utilities to the shared system; every surface uses these, no bespoke buttons:

- **Primary CTA** — silver/white outline, fills with the **light-point glow** (white, not gold) on hover, breathing glow at rest when it's the page's hero action. ONE per screen. (Edit `tokens.css:259-300` to swap gold for white/light-point.)
- **Ghost CTA** — text + hairline underline on hover (`tokens.css:304`). Keep.
- **Card** — near-black, 1px silver hairline, 8px radius, ambient shadow (`tokens.css:420`). Keep; apply to dashboard (replace `app.css:54` gold-top-border cards).
- **Score object** — see B3.2.
- **Blur-gate** — the silver premium blur (`tokens.css:368-417`) is excellent and on-brand; keep as the standard paywall device.
- **Eyebrow / mono-label / pill / hairline** — as defined. Keep.
- **Touch targets ≥ 44px** everywhere (fix dashboard checkbox `app.css:94` and buttons).

---

## B6. Before → After: the HERO (landing.html)

**Before:** Eyebrow pill ("Personal Growth · Redesigned") → uppercase Cormorant headline "Become the Main Character" → sub-paragraph → gold-ish primary + ghost button, centered over a white radial glow. The logo appears only 26px in the nav. Generic dark-startup hero; nothing ownable; the brand's best asset is hidden. (`landing.html:1181-1191`)

**After (described):**
- **The monogram becomes the hero.** The silver M (SVG) sits large and centered, its apex **light-point** glowing softly and breathing — the literal first thing seen, before any word. Pure black field, one soft glow from directly above (single light source, like the logo).
- Below it, in rationed Cormorant **italic**, the emotional line; beneath that, one calm Sora sub-line. Tracking and air do the luxury work; no eyebrow pill (it reads app-y).
- **One** primary CTA: silver-outline, white light-point glow, breathing. The ghost "See how it works" sits quietly beside/below it.
- A single restrained trust line in mono (e.g. one number or one quote) — the only "proof," stated once.
- Net effect: in 3 seconds a stranger sees a brushed-silver monogram lit by one white point on deep black — architectural, quiet, expensive — and *knows* this is a serious product before reading. The brand's signature is the hero, not a 26px afterthought.

---

## B7. Before → After: a FUNNEL screen (the audit reading, audit.html)

**Before:** Already the strongest surface — silver-gradient score numeral, mono sub-labels, hairline section rules, silver blur-gates. **But** the primary "Generate Full Report" CTA is **gold** (`--mc-btn-primary--filled` resolves to gold via `tokens.css:289-294`), and the light-point dot sits *next to* a gold button — the one moment the signature motif appears, it's fighting the accent. (`audit.html:382-395`)

**After (described):**
- Swap the CTA from gold to **white/silver outline with the light-point glow** — now the dot and the button are the same language; the signature reads as intentional.
- Promote the score to the **canonical score object** (B3.2): silver numeral + thin silver ring + the light-point marking the value, mono "/ 100". Same object the dashboard will use, so paying users see continuity instead of a costume change.
- Keep everything else (skeleton, blur-gates, section hairlines) — it's already right. The change is small precisely because the funnel is the template the rest of the site should copy.

The point of this before/after: the elevation is **mostly subtraction (gold) and propagation (the funnel's discipline)**, not a from-scratch redesign. That's why it's low-risk and high-lift.

---

# PART C — SEQUENCED ROADMAP (max perceived-quality lift first)

Each step flags whether it touches **founder-locked** material (tokens/fonts/hero copy per CLAUDE.md §2) and therefore needs explicit sign-off before code.

### Step 1 — Kill the color split (highest lift, mostly mechanical) 🔒 LOCKED-TOKEN CHANGE
- **What:** Remove gold + aubergine sitewide. In `tokens.css`, point `--mc-gold*` and the primary-CTA rules (`:51-54, 259, 271-273, 289-301`) to white/light-point. In `app.css` (dashboard) and `paywall.html`, replace the `--gold/--orator/--aesthetic/--sage` palette with the silver/white tokens. In `landing.html`, finish the migration: replace the aubergine body glow (`:79-82`) with the single soft white top-glow; fix the Aura++ box (`:1347`).
- **Surfaces:** all.
- **Why first:** this single change makes landing → funnel → dashboard read as one brand. It's the difference a stranger feels in 3 seconds, and it's find-and-replace, not redesign.
- **Sign-off:** YES — changes locked tokens (`--gold`) and the dashboard/report palette.

### Step 2 — Make `tokens.css` the single source of truth 🔒 LOCKED-TOKEN CHANGE
- **What:** Lift `tokens.css` into a sitewide stylesheet (drop the `body.lookmaxing` scoping so landing + dashboard inherit it). Migrate `landing.html` inline tokens and `app.css` to consume it. Delete duplicate `:root` blocks in `paywall.html`, `app.css`, `landing.html`.
- **Surfaces:** all.
- **Why:** one set of colors/type/spacing/motion = consistency by construction; removes the drift that created the split in the first place.
- **Sign-off:** YES — consolidates the locked token definitions.

### Step 3 — Promote the type system; kill inline font-sizes 🔒 TOUCHES LOCKED FONTS (scale, not faces)
- **What:** Route landing + dashboard through the `tokens.css` scale. Add JetBrains Mono to the dashboard for all data/scores. Ration Cormorant italic. Fix silver-faint contrast failures (`--mc-silver-faint` on body text → step up to `--mc-silver-dim` or brighter).
- **Surfaces:** landing, dashboard, paywall.
- **Sign-off:** PARTIAL — fonts (Cormorant/Sora) are unchanged and stay locked; only adds the already-specced mono role and applies the existing scale. Confirm with founder that adding JetBrains Mono to the dashboard is acceptable.

### Step 4 — Ship the SVG monogram + light-point motif
- **What:** Recreate the M-monogram + apex light-point as inline SVG. Place at hero scale on landing (B6). Wire the breathing glow to the dot. Use the light-point as the primary-CTA glow and the active-nav marker sitewide.
- **Surfaces:** landing (hero), all navs.
- **Why:** turns the logo from a hidden 26px crop into the brand's signature event; this is the "next-level / startup-grade" moment the founder asked for.
- **Sign-off:** Light — the logo itself is locked but unchanged; we're rendering the *same* mark more faithfully (SVG) and giving it presence. Confirm hero treatment.

### Step 5 — One canonical score object
- **What:** Design + build the single Aura/score graphic (silver numeral + ring + light-point + mono) and use it on `audit.html`, `/lookmax` dashboard, and reports. Retire the gold serif score (`app.css:81`) and the default-looking polyline chart.
- **Surfaces:** funnel audit, dashboard, reports.
- **Sign-off:** No locked-copy impact; design review only.

### Step 6 — De-glow, de-emoji, de-pulse (restraint pass)
- **What:** Reduce to one soft top-glow per page (delete stacked card/section glows and the aubergine wash). Replace dashboard emoji nav glyphs with hairline SVG icons. Delete `card--pulse`. Apply the grain overlay consistently across surfaces.
- **Surfaces:** landing, dashboard.
- **Sign-off:** No locked-copy impact.

### Step 7 — Trust + mobile polish
- **What:** Add one restrained trust signal (a single number or quote) to landing hero and the funnel. Re-base landing as mobile-first rather than patched. Fix sub-44px touch targets on the dashboard.
- **Surfaces:** landing, funnel, dashboard.
- **Sign-off:** Trust copy needs The Consultant's voice — route any new line through copy + founder (CLAUDE.md §2/§6.5). Layout changes are design-owned.

---

## What NOT to touch (already premium / locked)

- The funnel's structure, blur-gate, skeleton states, staggered reveals, `prefers-reduced-motion` handling — these are the model, not the problem.
- All Consultant copy, hero copy, rank/pillar copy — locked (CLAUDE.md §2). This audit changes *how it looks*, never *what it says*.
- The `◆` mark — keep as the brand's punctuation.
- The light-point motif and the breathing-glow animation — keep and propagate.

---

## One-paragraph summary for the founder

The site doesn't look AI-vibe-coded because any one screen is bad — the funnel is genuinely good. It looks that way because there are **three different visual systems** (silver funnel, gold dashboard, half-migrated landing) and the brand's accent color **changes from silver to gold the moment someone pays.** Your own logo is silver with a single white light-point and has no gold in it — so the fix isn't a gamble: **unify everything on black/silver + the white light-point, retire gold, and promote the funnel's already-strong system to the whole site.** Then give the brand its one signature move — the M-monogram lit by that single point, at hero scale, threaded through the experience. Most of this is subtraction and consolidation, not a redesign, which is why it's the highest perceived-quality lift available for the least risk. The result: a stranger lands and, in three seconds before reading a word, feels a quiet, expensive instrument — exactly what The Consultant is.
