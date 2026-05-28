# Lookmaxxing Audit — 3 Synthetic Sample Reports

> Author: backend-agent (gemini-prompt-engineer role) · Date: 2026-05-29  
> Cited spec: briefs/stage-1-audit-spec.md §6, §7  
> Purpose: contract reference for Wave 2A integration and founder morning review.  
> These are HAND-CRAFTED expected outputs — no Gemini was called.  
> The founder runs real photos through `/api/lookmaxing/analyze` and compares.

Each sample contains:
- 5 mock quiz answers
- 2-line photo description (synthetic — no real photo)
- Full expected JSON output (demonstrates schema + voice + safety rules + free/premium split)

---

## Sample A — "The Rising Founder"

### Archetype
Mid-20s founder type. Presentable but untouched. Clean skin, full hair, decent sleep, zero intentional grooming routine. The signal is mostly positive but the presentation is underdeveloped relative to the structural baseline. Biggest lever is posture — he carries a screen-forward hunch that costs him presence in the room.

### Purpose of this sample
- Shows the context-vs-quest rule applied to GOOD hair density (good density is context — presented without score; haircut geometry is quest-eligible)
- Shows mid-ascendant scoring (~62) with specific, non-generic rationale
- Shows the posture category (posturePresence safe-task library) as biggest lever
- Shows 4 freeSignals that are readable from a clean front-facing photo

### 5 Quiz Answers

| Q# | Choice | Label |
|----|--------|-------|
| Q1 — main goal | B | Attractive and likable — presence that draws people in |
| Q2 — skin | A | Tough — nothing much bothers it |
| Q3 — hair | A | Thick and healthy — no concerns there |
| Q4 — sleep | B | Around 6–7 hours most nights |
| Q5 — effort | B | Basic routine, want more structure |

### Photo Description (synthetic)
Well-lit front-facing photo, natural daylight from a window to the left. Subject is male, mid-20s, slight forward neck posture, clean complexion with minor forehead texture, full dark hair unstyled, wearing a plain navy tee. Jawline is defined but softened by minor puffiness along the lower third.

### Expected JSON Output

```json
{
  "auraScore": 62,
  "rank": "ascendant",
  "firstImpression": "The structure is strong — the presentation has not caught up to it yet.",
  "faceShape": "square",
  "freeSignals": [
    { "label": "Textured", "axis": "skinClarity" },
    { "label": "Soft", "axis": "jawlinePuffiness" },
    { "label": "Forward", "axis": "postureCarriage" },
    { "label": "Clear", "axis": "sclera" }
  ],
  "decomposition": {
    "skin": [
      {
        "metric": "skinClarity",
        "score": 68,
        "cause": "Minor forehead texture, likely a combination of mild oil and intermittent cleansing. No active inflammation. The underlying tone is even.",
        "fix": "Gentle cleanse morning and night — non-stripping formula only"
      },
      {
        "metric": "hydrationSignal",
        "score": 64,
        "cause": "Surface plumpness is present but not optimal. The 6-7h sleep answer and the no-routine baseline both limit skin recovery.",
        "fix": "Moisturise on slightly damp skin, within 60 seconds of cleansing"
      }
    ],
    "hair": [
      {
        "metric": "haircutFaceShapeMatch",
        "score": 44,
        "cause": "The current unstyled length adds width to the crown rather than length — working against the square jaw's proportions. The density is strong and gives excellent options.",
        "fix": "Book a haircut shaped to your face structure — a longer top with tighter sides would redirect the square jaw upward"
      }
    ],
    "jawAndFace": [
      {
        "metric": "jawlinePuffiness",
        "score": 58,
        "cause": "The jaw bone is strong — the soft-tissue puffiness along the lower third softens it. Likely a combination of sleep timing and sodium in the evening.",
        "fix": "Reduce sodium after 8pm — late salt drives morning facial puffiness"
      }
    ],
    "bodyAndPosture": [
      {
        "metric": "postureCarriage",
        "score": 41,
        "cause": "The head is approximately 3-4cm forward of the neutral position. The shoulders follow. At this age, this is entirely a movement pattern — not a structural constraint.",
        "fix": "Chin-tuck cue: draw the chin straight back, not down — hold 10 seconds, 5 times daily"
      },
      {
        "metric": "shoulderAlignment",
        "score": 45,
        "cause": "Mild forward shoulder rounding, consistent with extended screen work. It shortens the apparent neck and narrows the collar line.",
        "fix": "Shoulders-back cue: shoulder blades set back while crown draws up"
      }
    ],
    "lifestyleSignals": [
      {
        "metric": "sclera",
        "score": 74,
        "cause": "Sclera is bright and clear — a good hydration and sleep signal despite the 6-7h average.",
        "fix": "Consistent sleep and wake time, including weekends — circadian rhythm is a skin and sclera input"
      },
      {
        "metric": "expressionTension",
        "score": 66,
        "cause": "Resting expression is neutral and approachable. Minor brow furrow present — likely habitual concentration, not structural.",
        "fix": "Screens off 45 minutes before bed — sustained screen focus builds periorbital tension across the day"
      }
    ]
  },
  "biggestLever": {
    "metric": "postureCarriage",
    "score": 41,
    "rationale": "The structural baseline is genuinely strong. Posture is the single variable currently taxing it most — forward head carriage reads as low energy at a distance, before a word is spoken. This is a movement pattern, and it responds to daily cues faster than any other metric here."
  },
  "quests": [
    {
      "metric": "postureCarriage",
      "task": "Chin-tuck cue: draw the chin straight back, not down — hold 10 seconds, 5 times daily",
      "library": "posturePresence"
    },
    {
      "metric": "shoulderAlignment",
      "task": "One-minute thoracic extension over a foam roller or chair back, twice daily",
      "library": "posturePresence"
    },
    {
      "metric": "haircutFaceShapeMatch",
      "task": "Book a haircut shaped to your face structure — a longer top with tighter sides works with a square jaw",
      "library": "groomingShape"
    },
    {
      "metric": "jawlinePuffiness",
      "task": "Reduce sodium after 8pm — late salt drives morning facial puffiness",
      "library": "puffinessUnderEye"
    },
    {
      "metric": "skinClarity",
      "task": "Gentle cleanse morning and night — non-stripping formula only",
      "library": "skincareBasics"
    }
  ],
  "styleAndColour": {
    "haircut": "The square jaw reads as authority when the haircut adds vertical movement rather than horizontal width. A medium-length top — textured, not flat — with a tighter fade or taper on the sides directs the eye upward. The current unstyled length is neutral at best, a missed opportunity at worst. Your density makes every shape possible.",
    "palette": [
      "Navy — already wearing it, correct choice",
      "Forest green — works with warm undertone",
      "Charcoal — strong neutral, high formality read",
      "Off-white or warm cream — avoid bright white which flattens warm skin"
    ],
    "avoid": [
      "Bright white near the face — flattens warm undertone",
      "Busy prints at collar level — draws the eye away from the face",
      "Oversized fits — obscures the shoulder line that posture work will rebuild"
    ]
  },
  "starterPlan": [
    {
      "day": 1,
      "morning": "Chin-tuck cue before you open your phone — 10 seconds, 5 reps. Establish the pattern before the day pulls you forward.",
      "evening": "Gentle cleanse. Moisturise on damp skin. Note what you used — consistency matters more than product choice."
    },
    {
      "day": 2,
      "morning": "Chin-tuck cue again. Camera at eye level for any video call today — angle is posture you control immediately.",
      "evening": "Thoracic extension over a chair back for 60 seconds. Note how the shoulders feel vs Day 1."
    },
    {
      "day": 3,
      "morning": "Chin-tuck cue. Book the haircut if you have not — the structure is already there, waiting for shape.",
      "evening": "SPF reminder for tomorrow morning — start the habit now, apply in the AM."
    },
    {
      "day": 4,
      "morning": "Chin-tuck cue. SPF 30+ before you leave. Both are sub-30-second habits.",
      "evening": "Reduce sodium with dinner — track what you eat after 8pm for one night."
    },
    {
      "day": 5,
      "morning": "Chin-tuck cue. Raise your screen by one book's height if it's still at chest level.",
      "evening": "Thoracic extension, 60 seconds. Screens off 45 minutes before bed — call it early this once."
    },
    {
      "day": 6,
      "morning": "Chin-tuck cue. Shoulders-back cue — blade-set, crown-up. Two cues, 20 seconds total.",
      "evening": "Cleanse and moisturise. Note whether the skin feels different vs Day 1."
    },
    {
      "day": 7,
      "morning": "Chin-tuck cue. A week of posture work does not transform — it establishes. The work continues.",
      "evening": "Thoracic extension. Take a front-facing photo in the same light as the audit photo. You will see what the protocol moved. ◆ MainCharacter"
    }
  ],
  "context": {
    "boneStructure": "Square jaw with strong mandibular definition — this is a structural asset. No task applies here; no task is needed.",
    "hairDensity": "Thick and uniform. The hairline is intact and the density is high across the crown. Presented as context — no score. The geometry of the cut is what matters here, not the density.",
    "colouring": "Warm undertone — golden-brown base with yellow sub-tones in the skin. This determines the palette toward navies, forest greens, and charcoal rather than cool greys or pastels.",
    "eyeShape": "Neutral canthal angle. Deep-set orbital area contributes to the strong brow presence. Presented for context."
  },
  "warnings": []
}
```

---

## Sample B — "The Tired Marker"

### Archetype
Late 20s, high-output professional. Sensitive breakout-prone skin, thinning hair he is already treating (important: the quiz answer "already treating loss" flows into the prompt — the model must acknowledge this without naming any treatment), chronic under-6-hour sleep, no skincare routine. Aura ~38, late-seeker range. Multiple compounding factors but clear levers exist in sleep hygiene and under-eye care.

### Purpose of this sample
- Shows the hard-prohibition pattern: quiz answer says "already treating hair loss" — the model may NOT name the treatment or recommend alternatives. The hair section routes to context, notes the treatment is in progress, and says nothing further. No quest for hair.
- Shows the biggest lever as under-eye/sleep — an accessible intervention that requires no product
- Shows sleep hygiene as the dominant quest
- Shows `warnings` array carrying the professional-referral note for the hair metric

### 5 Quiz Answers

| Q# | Choice | Label |
|----|--------|-------|
| Q1 — main goal | D | Fix the messy features — I know what's not working |
| Q2 — skin | B | Sensitive — red patches, itchy flare-ups |
| Q3 — hair | C | Already treating hair loss — under a doctor |
| Q4 — sleep | A | Not enough — always tired |
| Q5 — effort | A | Zero — soap and water |

### Photo Description (synthetic)
Front-facing photo, indoor overhead lighting. Subject is male, late 20s, marked under-eye discolouration and mild puffiness, redness across the nose and cheeks (consistent with sensitive/rosacea-type skin), hairline slightly higher at the temples, wearing a white shirt. Expression is neutral but periorbital area reads as fatigued. Good bone structure, strong brow.

### Expected JSON Output

```json
{
  "auraScore": 38,
  "rank": "seeker",
  "firstImpression": "The fatigue is reading louder than the structure beneath it — the structure is worth protecting.",
  "faceShape": "oval",
  "freeSignals": [
    { "label": "Tired", "axis": "underEyeState" },
    { "label": "Reactive", "axis": "skinClarity" },
    { "label": "Puffy", "axis": "underEyePuffiness" },
    { "label": "Clear", "axis": "sclera" }
  ],
  "decomposition": {
    "skin": [
      {
        "metric": "skinClarity",
        "score": 34,
        "cause": "Visible redness across the nose and cheeks — pattern is consistent with a reactive or sensitive-type barrier. The soap-and-water-only baseline is likely stripping the barrier further.",
        "fix": "Gentle cleanse morning and night — non-stripping formula only. With sensitive skin, less intervention is more."
      },
      {
        "metric": "hydrationSignal",
        "score": 38,
        "cause": "Surface looks tight and dehydrated — consistent with both the sleep pattern and the barrier disruption from soap-only cleansing.",
        "fix": "Moisturise on slightly damp skin, within 60 seconds of cleansing — barrier repair is the priority before anything else"
      }
    ],
    "hair": [],
    "jawAndFace": [
      {
        "metric": "underEyePuffiness",
        "score": 31,
        "cause": "Marked periorbital puffiness, most prominent in the medial under-eye. Consistent with chronic sleep deficit and high late-screen exposure. The photo shows this is a daily state, not an anomaly.",
        "fix": "Cold-water splash on the eye area, 10 seconds, first thing each morning"
      },
      {
        "metric": "underEyeState",
        "score": 29,
        "cause": "Dark discolouration in the under-eye area — a combination of vascular pooling from sleep deficit and thin skin in the periorbital zone. The sleep answer confirms this is chronic.",
        "fix": "Consistent sleep and wake time, including weekends — the discolouration is a sleep signal, not a product problem"
      }
    ],
    "bodyAndPosture": [
      {
        "metric": "postureCarriage",
        "score": 55,
        "cause": "Carriage is neutral — not a primary lever here. No significant forward-head position visible.",
        "fix": "Chin-tuck cue: draw the chin straight back, not down — maintain what is already working"
      }
    ],
    "lifestyleSignals": [
      {
        "metric": "sclera",
        "score": 61,
        "cause": "Sclera is reasonably clear given the sleep deficit — better than the periorbital area suggests. This is a minor positive signal.",
        "fix": "Consistent sleep and wake time — the scleral clarity will follow the sleep pattern more than anything else"
      },
      {
        "metric": "expressionTension",
        "score": 48,
        "cause": "Some periorbital tension — consistent with chronic fatigue. Not structural.",
        "fix": "Screens off 45 minutes before bed — the tension pattern is a late-screen signal"
      }
    ]
  },
  "biggestLever": {
    "metric": "underEyeState",
    "score": 29,
    "rationale": "The under-eye area is the loudest signal in the read — it is aging the face in a way that the bone structure does not warrant. Sleep consistency is the intervention. Nothing else moves this metric as reliably or as fast."
  },
  "quests": [
    {
      "metric": "underEyeState",
      "task": "Consistent sleep and wake time, including weekends — start this week, not next",
      "library": "hydrationSleep"
    },
    {
      "metric": "underEyePuffiness",
      "task": "Cold spoon or jade roller under-eye: 30 seconds per side, mornings — 7 nights",
      "library": "puffinessUnderEye"
    },
    {
      "metric": "underEyePuffiness",
      "task": "Reduce sodium after 8pm — late salt drives morning facial puffiness",
      "library": "puffinessUnderEye"
    },
    {
      "metric": "skinClarity",
      "task": "Gentle cleanse morning and night — non-stripping formula only. With sensitive skin, fragrance-free is the default filter.",
      "library": "skincareBasics"
    },
    {
      "metric": "hydrationSignal",
      "task": "Moisturise on slightly damp skin, within 60 seconds of cleansing — one product, consistent application",
      "library": "skincareBasics"
    }
  ],
  "styleAndColour": {
    "haircut": "The hairline geometry is the relevant variable — not density, which is in context. A cut that keeps weight and length slightly higher at the crown and temples, with a soft fringe or textured front, works with the current geometry. Avoid severe undercuts or close-shaved sides — these draw the eye to the hairline.",
    "palette": [
      "Deep navy or midnight blue — grounds the look, low contrast with cool undertone",
      "Slate grey — neutral, professional, works across contexts",
      "Burgundy or deep wine — warm accent that lifts without clashing",
      "Soft white or ivory — cooler than bright white, less harsh against reactive skin"
    ],
    "avoid": [
      "Bright red near the face — amplifies the skin redness",
      "Neon or high-chroma colours at the collar — competing with the skin signal",
      "Very high-contrast colour blocks at chest level when skin is reactive — draws attention upward"
    ]
  },
  "starterPlan": [
    {
      "day": 1,
      "morning": "Cold-water splash on the eye area, 10 seconds. Then set a consistent wake time — write it down. These are the two levers.",
      "evening": "Gentle cleanse — non-stripping only. No soap. Go to bed at the target time."
    },
    {
      "day": 2,
      "morning": "Cold-water splash, 10 seconds. Same wake time as yesterday.",
      "evening": "Moisturise on damp skin after cleanse. Note how the skin feels. Go to bed at target time."
    },
    {
      "day": 3,
      "morning": "Cold spoon under-eye, 30 seconds per side. Same wake time.",
      "evening": "Screens off 45 minutes before bed. Sodium check with dinner — note what you ate after 8pm."
    },
    {
      "day": 4,
      "morning": "Cold spoon under-eye. Same wake time. The puffiness takes 4-5 days to begin shifting.",
      "evening": "Gentle cleanse and moisturise. Target sleep time."
    },
    {
      "day": 5,
      "morning": "Cold spoon under-eye. Same wake time. Water through the morning — 2 glasses before midday.",
      "evening": "Reduce sodium after 8pm. Screens off 45 minutes before bed."
    },
    {
      "day": 6,
      "morning": "Cold spoon under-eye. Same wake time. You are building a pattern, not a solution — the pattern is the solution.",
      "evening": "Gentle cleanse. Moisturise. Consistent time."
    },
    {
      "day": 7,
      "morning": "Cold spoon under-eye. Same wake time. Take a front-facing photo in the same light as the audit photo.",
      "evening": "Note what shifted and what held. The under-eye is the indicator — it tells you what the rest of the week was. ◆ MainCharacter"
    }
  ],
  "context": {
    "boneStructure": "Strong oval structure with a well-defined brow ridge. This is a structural foundation worth protecting. The fatigue signals are reading in front of it — not from it.",
    "hairDensity": "The quiz indicates active professional treatment for hair density — this area is appropriately in a clinician's hands. No assessment or recommendation is made here. The geometry of the haircut remains within this report's scope.",
    "colouring": "Cool undertone — pink-red base with blue sub-tones in the skin. This determines the palette toward cooler navies, slates, and deep wines rather than warm ambers or olive tones.",
    "eyeShape": "Deep-set with a strong brow — this is a structural feature that reads as intensity and focus. Presented for context."
  },
  "warnings": [
    "Hair density: the quiz reports active professional treatment. This audit makes no recommendations regarding hair density, density-related products, or supplementary interventions — this is one for a qualified professional, and the professional is already involved.",
    "Skin redness: the pattern visible is consistent with a reactive or sensitive-type barrier. This is not a diagnosis. If redness is persistent, inflamed, or accompanied by significant irritation, a dermatologist's assessment is appropriate before adding any new product."
  ]
}
```

---

## Sample C — "The Dysmorphic Edge"

### Archetype
Well-presented subject — well-lit photo, clean face, strong objective baseline (~71, luminary-trajectory). All 5 quiz answers indicate heavy self-criticism: goal is "fix the messy features," skin self-rated as oily/problematic, hair flagged as thinning despite photo showing good density, sleep is adequate, effort is high. The person's self-assessment is substantially harsher than the objective read. The model must handle this without shaming, without dismissing, and without pathologising. One metric that the subject's answers flag as a problem is structurally fine — the model presents it as context and routes the underlying concern to warnings.

### Purpose of this sample
- Shows the model REFUSING to shame: structural traits are presented as context, never as flaws
- Shows the model routing one anxiety-flagged metric to `"This is one for a qualified professional."` because the gap between self-assessment and objective read is significant enough to warrant it
- Shows a high Aura Score despite self-reported concerns — the model trusts the photo over the anxiety
- Shows `warnings` carrying a professional-referral note for the self-perception gap
- Demonstrates that the freeSignals and decomposition read what is objectively there, not what the user fears

### 5 Quiz Answers

| Q# | Choice | Label |
|----|--------|-------|
| Q1 — main goal | D | Fix the messy features — I know what's not working |
| Q2 — skin | C | Oily — shiny, breakouts, I hate how it looks |
| Q3 — hair | B | Thinning or receding |
| Q4 — sleep | C | 8+ hours — sleep is good |
| Q5 — effort | C | Already tracking grooming and posture — very deliberate about it |

### Photo Description (synthetic)
Well-lit three-quarter front photo, natural daylight. Subject is male, mid-20s, clean complexion with normal T-zone shine (no visible breakouts), full dark hair with no visible recession or thinning at the hairline, good posture, plain white shirt. Jawline is clean. Eye area is clear. Skin reads as normal-oily range, not inflamed.

### Expected JSON Output

```json
{
  "auraScore": 71,
  "rank": "luminary",
  "firstImpression": "The photo and the answers are reading a different person — the photo is closer to the truth.",
  "faceShape": "oval",
  "freeSignals": [
    { "label": "Clear", "axis": "skinClarity" },
    { "label": "Sharp", "axis": "postureCarriage" },
    { "label": "Bright", "axis": "sclera" },
    { "label": "Defined", "axis": "jawlinePuffiness" }
  ],
  "decomposition": {
    "skin": [
      {
        "metric": "skinClarity",
        "score": 72,
        "cause": "The photo shows a clean complexion with normal T-zone shine. No active breakouts visible. The quiz describes oily, problematic skin — the photo does not confirm active inflammation today.",
        "fix": "SPF 30+ broad-spectrum, every morning, regardless of weather — the clarity visible here is worth maintaining"
      },
      {
        "metric": "hydrationSignal",
        "score": 74,
        "cause": "Skin plumpness and surface quality are good — consistent with 8+ hours of sleep and high effort on grooming. This is a positive signal.",
        "fix": "Moisturise on slightly damp skin — even oily skin benefits from a lightweight, non-comedogenic moisturiser"
      }
    ],
    "hair": [],
    "jawAndFace": [
      {
        "metric": "jawlinePuffiness",
        "score": 68,
        "cause": "The jaw reads clean and defined. Minor soft-tissue volume along the lower third — within normal range, not a primary lever.",
        "fix": "Reduce sodium after 8pm if morning puffiness is a concern — the baseline here is already strong"
      },
      {
        "metric": "beardGeometry",
        "score": 61,
        "cause": "Beard line geometry is functional but imprecise — the line sits slightly below the natural crease, which softens the jaw read. Given the effort level reported, a tighter line would be a fast win.",
        "fix": "Define the beard line 3mm above the natural jaw crease — the precision reads at distance"
      }
    ],
    "bodyAndPosture": [
      {
        "metric": "postureCarriage",
        "score": 76,
        "cause": "Head-neck-shoulder carriage is notably upright — consistent with the high-effort self-report. This is a genuine positive signal and a structural differentiator.",
        "fix": "Maintain the chin-tuck habit — at this level, the work is maintenance not correction"
      }
    ],
    "lifestyleSignals": [
      {
        "metric": "sclera",
        "score": 79,
        "cause": "Scleral brightness is high — consistent with 8+ hours of sleep and good hydration. This is one of the clearest positive signals in the read.",
        "fix": "Consistent sleep and wake time, including weekends — protect what is already working"
      },
      {
        "metric": "expressionTension",
        "score": 58,
        "cause": "Mild brow tension visible at rest — the expression is neutral but the periorbital area carries some effort. This may be habitual concentration rather than structural.",
        "fix": "Screens off 45 minutes before bed — sustained focus builds periorbital tension over the day"
      }
    ]
  },
  "biggestLever": {
    "metric": "beardGeometry",
    "score": 61,
    "rationale": "The baseline here is genuinely strong — most of the structural and lifestyle metrics are in the upper half. The beard line is the most accessible precision gain: a sharper line at the jaw crease tightens the entire lower-third read. Given the effort already applied to grooming, this is an adjustment, not a new commitment."
  },
  "quests": [
    {
      "metric": "beardGeometry",
      "task": "Define the beard line 3mm above the natural jaw crease — blurry lines age the face",
      "library": "groomingShape"
    },
    {
      "metric": "skinClarity",
      "task": "SPF 30+ broad-spectrum, every morning — the clarity visible today is worth protecting",
      "library": "skincareBasics"
    },
    {
      "metric": "expressionTension",
      "task": "Screens off 45 minutes before bed — sustained screen focus builds periorbital tension across the day",
      "library": "hydrationSleep"
    },
    {
      "metric": "wardrobeColourCohesion",
      "task": "Wear the palette colours identified in the colour profile — the white reads clean but the range can work harder",
      "library": "wardrobeColour"
    }
  ],
  "styleAndColour": {
    "haircut": "The current length and style suit the oval face well — oval is the most forgiving shape for haircut variation. The priority, given the self-reported concern about density, is to avoid cuts that thin the hair visually: avoid very close-cropped tops or wet-look styles that separate the hair. The current density does not require this — but if the concern continues, the haircut is where to start, not the density itself.",
    "palette": [
      "Navy — strong choice, already working",
      "Charcoal — high authority read, good with warm-neutral undertone",
      "Olive or sage — earthy tone that works with warm-neutral skin",
      "Cream or warm off-white — softer alternative to the bright white"
    ],
    "avoid": [
      "Bright white at the collar when skin is showing T-zone shine — the contrast exaggerates it",
      "Very pale greys — can flatten the warm-neutral tone",
      "Busy collar patterns — the face is doing the work; the frame should stay quiet"
    ]
  },
  "starterPlan": [
    {
      "day": 1,
      "morning": "SPF 30+ before you leave. One product, every day — the consistency is the intervention.",
      "evening": "Define the beard line. Take a photo after — see the difference a precise line makes."
    },
    {
      "day": 2,
      "morning": "SPF. Chin-tuck cue — one quick check to maintain the posture already built.",
      "evening": "Screens off 45 minutes before bed. Note the brow tension when you close the screens early."
    },
    {
      "day": 3,
      "morning": "SPF. Look at the beard line in daylight — adjust if needed.",
      "evening": "Gentle cleanse. Lightweight moisturise. Consistent time."
    },
    {
      "day": 4,
      "morning": "SPF. Raise screen by one book's height if needed — camera at eye level for calls.",
      "evening": "Screens off 45 minutes early. The periorbital tension will tell you if it worked."
    },
    {
      "day": 5,
      "morning": "SPF. Wear one piece from the palette today — swap the white for navy or charcoal.",
      "evening": "Beard line check. Note whether the grooming feels more precise."
    },
    {
      "day": 6,
      "morning": "SPF. Chin-tuck cue — 5 reps. The posture is already strong; the habit protects it.",
      "evening": "Screens off 45 minutes early. Same consistent sleep time."
    },
    {
      "day": 7,
      "morning": "SPF. Take a front-facing photo in the same light as the audit photo.",
      "evening": "The score here started at 71. The levers left are precision levers — they sharpen what is already working. Note what changed. ◆ MainCharacter"
    }
  ],
  "context": {
    "boneStructure": "Well-proportioned oval with good orbital structure and a defined midface. Presented for context — this is a structural asset, not a starting point for change.",
    "hairDensity": "The photo does not show thinning or recession at the hairline or crown. Density appears full and uniform. The quiz reported thinning — the discrepancy between self-assessment and the photo read is noted in warnings.",
    "colouring": "Warm-neutral undertone — golden base with balanced sub-tones. Palette recommendations reflect this.",
    "eyeShape": "Neutral canthal angle with well-defined orbital area. Presented for context."
  },
  "warnings": [
    "Self-assessment and photo read diverge on two metrics: skin (quiz: oily and problematic; photo: clear complexion, no active inflammation today) and hair density (quiz: thinning or receding; photo: full, uniform density with no visible recession). This divergence is noted — not dismissed. If the self-perception of these traits is causing significant distress, this is one for a qualified professional. A dermatologist for skin and a trichologist for hair can provide an objective clinical baseline. This report reflects what the photo shows today.",
    "The model did not score or assign a task for hair density. The photo does not support a thinning or recession finding — and scoring hair density in the absence of photographic evidence of change would not be honest. The geometry of the haircut remains in scope; the density question goes to context."
  ]
}
```

---

## Hardest sample to hand-craft and why

**Sample C — "The Dysmorphic Edge"** was the most demanding.

The tension: the spec requires the model to trust the photo over the quiz answers when they diverge — but dismissing the self-reported anxiety completely would be unkind and potentially dangerous. The right contract behaviour is to (1) report honestly what the photo shows, (2) note the divergence plainly without dramatising it, and (3) route the underlying distress — not the metric — to professional guidance via `warnings`. The `"This is one for a qualified professional."` phrase must appear without being preceded by any instruction (per the spec), but the reason it appears needs to be legible.

The schema makes this harder: `context` holds the honest read ("photo shows full density"), and `warnings` holds the safety notice, but neither field should contain a score or a task for hair density. Keeping those two concerns clean while remaining warm rather than clinical required multiple iterations of the `warnings` wording.

The `firstImpression` line was also the last to stabilise: "The photo and the answers are reading a different person — the photo is closer to the truth." It had to carry the whole situation in 18 words without condescension, without alarm, and without being falsely reassuring. Three drafts were discarded for being too gentle (felt like avoidance), too clinical (felt like a report), or too direct (felt like a correction). The final line lands as observation, not verdict.

---

*End of synthetic samples. Real photo tests will follow once the founder runs inputs through the live `/api/lookmaxing/analyze` route.*
