/**
 * ═══════════════════════════════════════════════════════════════════
 * LOOKMAXXING CONTENT — protocol library (Night-4, P5.1)
 * ═══════════════════════════════════════════════════════════════════
 *
 * PROTOCOL_LIBRARY is keyed by protocol bucket (skin, hair, jaw, posture,
 * lifestyle). Each item: { id, axis, title, instruction, evidenceTier (1-3),
 * category: 'do' | 'do-not' }.
 *
 * evidenceTier: 1 = RCT-supported, 2 = Mechanism-supported, 3 = Observational.
 *
 * ⚠ ALL copy below is // TODO copy review — drafted to the founder's evidence
 * spec, not yet approved Consultant voice. Surfaced in BACKLOG → COPY REVIEW
 * QUEUE. The founder (Customer #1) receives every item, unfiltered
 * (DECISIONS.md Night-4 #7), including the explicit medical do-nots.
 */

// Maps an 8-axis key (AESTHETIC_AXES) to a protocol bucket.
const AXIS_TO_BUCKET = {
  skinClarity: 'skin',
  hairDensity: 'hair',
  jawDefinition: 'jaw',
  posture: 'posture',
  eyeArea: 'lifestyle',
  facialHarmony: 'jaw',
  expression: 'lifestyle',
  bodyComposition: 'lifestyle',
};

// TODO copy review — every string below pending founder approval.
const PROTOCOL_LIBRARY = {
  skin: [
    { id: 'skin-1', axis: 'skinClarity', category: 'do', evidenceTier: 1, title: 'Sunscreen, every morning', instruction: 'Broad-spectrum SPF 30+ on the face daily, rain or shine. UV is the single largest driver of visible skin ageing.' },
    { id: 'skin-2', axis: 'skinClarity', category: 'do', evidenceTier: 2, title: 'Gentle cleanse, twice daily', instruction: 'A non-stripping cleanser morning and night. Over-washing damages the barrier.' },
    { id: 'skin-3', axis: 'skinClarity', category: 'do', evidenceTier: 1, title: 'Retinoid at night', instruction: 'Start a low-strength retinoid 2-3 nights a week, building tolerance. Strongest evidence for texture and clarity.' },
    { id: 'skin-4', axis: 'skinClarity', category: 'do', evidenceTier: 2, title: 'Moisturise on damp skin', instruction: 'Lock in hydration within a minute of cleansing.' },
    { id: 'skin-5', axis: 'skinClarity', category: 'do', evidenceTier: 2, title: 'Protect sleep for skin repair', instruction: 'Skin repairs during deep sleep — aim for 7-8 hours.' },
    { id: 'skin-dn-1', axis: 'skinClarity', category: 'do-not', evidenceTier: 2, title: 'DO NOT over-exfoliate', instruction: 'More than 2-3x a week strips the barrier and worsens clarity.' },
    { id: 'skin-dn-2', axis: 'skinClarity', category: 'do-not', evidenceTier: 3, title: 'DO NOT mix retinoid with niacinamide the same night', instruction: 'Layering actives can irritate — alternate nights instead.' },
  ],
  hair: [
    { id: 'hair-1', axis: 'hairDensity', category: 'do', evidenceTier: 1, title: 'Minoxidil 5%, once daily', instruction: '1ml topical to the scalp. RCT-supported for density and regrowth.' },
    { id: 'hair-2', axis: 'hairDensity', category: 'do', evidenceTier: 1, title: 'Ketoconazole 2% shampoo, 2-3x/week', instruction: 'Anti-androgenic at the scalp; RCT-supported as adjunct therapy.' },
    { id: 'hair-3', axis: 'hairDensity', category: 'do', evidenceTier: 1, title: 'Microneedling 0.5-1mm weekly', instruction: 'RCT-supported in combination with minoxidil. One session per week.' },
    { id: 'hair-4', axis: 'hairDensity', category: 'do', evidenceTier: 3, title: 'Morning sunlight, 10 minutes', instruction: 'Pre-9am light supports circulation and circadian rhythm.' },
    { id: 'hair-5', axis: 'hairDensity', category: 'do', evidenceTier: 3, title: 'Scalp massage, 3 minutes daily', instruction: 'May improve dermal blood flow.' },
    { id: 'hair-dn-1', axis: 'hairDensity', category: 'do-not', evidenceTier: 3, title: 'DO NOT rely on laser combs at home', instruction: 'Weak evidence — spend the effort on minoxidil + ketoconazole.' },
    { id: 'hair-dn-2', axis: 'hairDensity', category: 'do-not', evidenceTier: 3, title: 'DO NOT take biotin without a deficiency', instruction: 'No evidence it helps non-deficient adults.' },
  ],
  jaw: [
    { id: 'jaw-1', axis: 'jawDefinition', category: 'do', evidenceTier: 1, title: 'Lower facial body fat through a small deficit', instruction: 'A leaner face sharpens the jawline more than any exercise.' },
    { id: 'jaw-2', axis: 'jawDefinition', category: 'do', evidenceTier: 3, title: 'Rest the tongue on the palate', instruction: 'Neutral resting tongue posture may help over years. Rest it — never strain.' },
    { id: 'jaw-3', axis: 'jawDefinition', category: 'do', evidenceTier: 2, title: 'Reduce sodium and alcohol', instruction: 'Both drive facial water retention and puffiness.' },
    { id: 'jaw-dn-1', axis: 'jawDefinition', category: 'do-not', evidenceTier: 2, title: 'DO NOT use jaw exercisers', instruction: 'No evidence they sharpen the jaw; risk of TMJ strain and masseter overgrowth.' },
    { id: 'jaw-dn-2', axis: 'jawDefinition', category: 'do-not', evidenceTier: 3, title: 'DO NOT chew gum aggressively for "definition"', instruction: 'Overworking the masseter widens the lower face, it does not sharpen it.' },
  ],
  posture: [
    { id: 'posture-1', axis: 'posture', category: 'do', evidenceTier: 2, title: 'Thoracic extension, 2 minutes daily', instruction: 'Counteracts the forward hunch from screens.' },
    { id: 'posture-2', axis: 'posture', category: 'do', evidenceTier: 2, title: 'Set screens to eye level', instruction: 'Stops chronic neck flexion (tech neck).' },
    { id: 'posture-3', axis: 'posture', category: 'do', evidenceTier: 1, title: 'Strengthen the upper back', instruction: 'Rows and face-pulls 2-3x/week pull the shoulders back.' },
    { id: 'posture-4', axis: 'posture', category: 'do', evidenceTier: 3, title: 'Stand tall, chin lightly tucked', instruction: 'A neutral spine with a slight chin tuck reads as composure.' },
    { id: 'posture-dn-1', axis: 'posture', category: 'do-not', evidenceTier: 3, title: 'DO NOT force military posture all day', instruction: 'Rigid over-correction fatigues — aim for relaxed neutral.' },
  ],
  lifestyle: [
    { id: 'life-1', axis: 'expression', category: 'do', evidenceTier: 1, title: 'Sleep 7-8 hours', instruction: 'The highest-leverage variable for skin, eyes and recovery.' },
    { id: 'life-2', axis: 'bodyComposition', category: 'do', evidenceTier: 2, title: 'Protein at every meal', instruction: 'Supports skin, hair and lean mass.' },
    { id: 'life-3', axis: 'eyeArea', category: 'do', evidenceTier: 2, title: 'Hydrate — 2-3L water per day', instruction: 'Visible in skin and under-eye area within days.' },
    { id: 'life-4', axis: 'bodyComposition', category: 'do', evidenceTier: 1, title: 'Strength train 3x/week', instruction: 'Improves posture, body composition and presence.' },
    { id: 'life-5', axis: 'skinClarity', category: 'do', evidenceTier: 2, title: 'Cut ultra-processed sugar', instruction: 'Glycation ages skin; spikes drive puffiness.' },
    { id: 'life-dn-1', axis: 'bodyComposition', category: 'do-not', evidenceTier: 2, title: 'DO NOT crash diet', instruction: 'Rapid loss costs muscle and gauntness — aim for 0.5-0.75kg per week.' },
  ],
};

// Advanced-hair note surfaced when a Norwood reading warrants the finasteride
// conversation (referenced by services/hair.js). // TODO copy review.
const FINASTERIDE_NOTE =
  'Consult your dermatologist — prescription only. Strongly supported by RCTs but has systemic effects.';

module.exports = { PROTOCOL_LIBRARY, AXIS_TO_BUCKET, FINASTERIDE_NOTE };
