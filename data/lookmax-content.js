/**
 * ═══════════════════════════════════════════════════════════════════
 * LOOKMAXXING CONTENT — protocol library (SAFE-ONLY, Phase 1 2026-05-30)
 * ═══════════════════════════════════════════════════════════════════
 *
 * PROTOCOL_LIBRARY is keyed by protocol bucket (skin, hair, jaw, posture,
 * lifestyle). Each item: { id, axis, title, instruction, category: 'do'|'do-not' }.
 *
 * SAFETY (CLAUDE.md §safety): MainCharacter is NOT a medical service. Every
 * item here is restricted to the health-positive ALLOW-LIST — sleep, hydration,
 * generic sun protection, gentle/generic skincare (cleanse + moisturise, NO
 * actives by name or strength), posture, grooming/beard geometry, haircut &
 * style, wardrobe colour. NO drug names, NO supplement names, NO dosages or
 * strengths, NO "RCT/clinical" framing, NO prescriptive diets. Everything below
 * also passes lib/safety-validator.js as a server-side backstop before it
 * reaches a user (see services/protocol.js).
 *
 * The former evidenceTier / RCT-supported / Mechanism-supported tags were
 * removed entirely (Phase 1) — they implied clinical authority we do not hold.
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

const PROTOCOL_LIBRARY = {
  skin: [
    { id: 'skin-1', axis: 'skinClarity', category: 'do', title: 'Sunscreen, every morning', instruction: 'A broad-spectrum facial sunscreen each morning, rain or shine. Daylight is the single largest driver of visible skin ageing.' },
    { id: 'skin-2', axis: 'skinClarity', category: 'do', title: 'Gentle cleanse, twice daily', instruction: 'A mild, non-stripping cleanser morning and night. Over-washing damages the barrier and shows.' },
    { id: 'skin-3', axis: 'skinClarity', category: 'do', title: 'Moisturise on damp skin', instruction: 'Apply moisturiser within a minute of cleansing, while the skin is still damp, to hold hydration.' },
    { id: 'skin-4', axis: 'skinClarity', category: 'do', title: 'Protect sleep for skin repair', instruction: 'Skin recovers during deep sleep. Hold a consistent 7-8 hour window.' },
    { id: 'skin-5', axis: 'skinClarity', category: 'do', title: 'Keep the hands off the face', instruction: 'Resting hands or phone against the face transfers oil and bacteria. A small habit with a visible payoff.' },
    { id: 'skin-dn-1', axis: 'skinClarity', category: 'do-not', title: 'DO NOT over-scrub', instruction: 'Harsh, frequent scrubbing strips the barrier and worsens clarity. Gentle and consistent wins.' },
    { id: 'skin-dn-2', axis: 'skinClarity', category: 'do-not', title: 'DO NOT chase a routine you cannot keep', instruction: 'A simple routine you hold every day beats an elaborate one you abandon by Thursday.' },
  ],
  hair: [
    { id: 'hair-1', axis: 'hairDensity', category: 'do', title: 'Wash on a steady rhythm', instruction: 'Keep the scalp clean on a regular cadence with a gentle shampoo. A calm scalp reads better than any product claim.' },
    { id: 'hair-2', axis: 'hairDensity', category: 'do', title: 'Sun protection for the scalp', instruction: 'Shade or a cap for the crown in strong midday sun, especially where coverage is thinner.' },
    { id: 'hair-3', axis: 'hairDensity', category: 'do', title: 'A cut that works with the hairline', instruction: 'Take the photo to a barber and ask for a shape that suits your current hairline, not against it. Geometry beats density.' },
    { id: 'hair-4', axis: 'hairDensity', category: 'do', title: 'Morning light, 10 minutes', instruction: 'Ten minutes of daylight before 9am supports your circadian rhythm. Good for sleep, and sleep shows in hair condition.' },
    { id: 'hair-5', axis: 'hairDensity', category: 'do', title: 'Sleep and stress, held steady', instruction: 'Consistent sleep and lower day-to-day stress show in hair condition over weeks. Protect both.' },
    { id: 'hair-dn-1', axis: 'hairDensity', category: 'do-not', title: 'DO NOT chase miracle products online', instruction: 'Most viral hair products promise more than they deliver. Spend the energy on a good cut and steady basics.' },
    { id: 'hair-dn-2', axis: 'hairDensity', category: 'do-not', title: 'DO NOT pull or tug at the hairline', instruction: 'Tight styles and constant tugging stress the hairline. Keep tension off it.' },
  ],
  jaw: [
    { id: 'jaw-1', axis: 'jawDefinition', category: 'do', title: 'Reduce evening salt and alcohol', instruction: 'Both drive overnight facial water retention. Easing them sharpens the morning read of the lower face.' },
    { id: 'jaw-2', axis: 'jawDefinition', category: 'do', title: 'Rest the tongue on the palate', instruction: 'Let the tongue rest lightly on the roof of the mouth. Rest it — never strain or push.' },
    { id: 'jaw-3', axis: 'jawDefinition', category: 'do', title: 'Hold the head level', instruction: 'A neutral head carriage with a light chin position reads as composure and lengthens the jawline in photos.' },
    { id: 'jaw-dn-1', axis: 'jawDefinition', category: 'do-not', title: 'DO NOT use jaw exercisers', instruction: 'No good reason to believe they sharpen the jaw, and they risk jaw-joint strain. Skip them.' },
    { id: 'jaw-dn-2', axis: 'jawDefinition', category: 'do-not', title: 'DO NOT chew gum aggressively for "definition"', instruction: 'Overworking the chewing muscles widens the lower face — it does not sharpen it.' },
  ],
  posture: [
    { id: 'posture-1', axis: 'posture', category: 'do', title: 'Two minutes of thoracic extension', instruction: 'Gently open the upper back over a chair edge for two minutes daily. It counters the forward hunch from screens.' },
    { id: 'posture-2', axis: 'posture', category: 'do', title: 'Screens to eye level', instruction: 'Raise the monitor and lift the phone so the neck stays neutral. Tech-neck flattens presence.' },
    { id: 'posture-3', axis: 'posture', category: 'do', title: 'Set the shoulders back and down', instruction: 'Draw the shoulder blades gently back and down through the day. Carriage is half of presence.' },
    { id: 'posture-4', axis: 'posture', category: 'do', title: 'Stand tall, chin lightly tucked', instruction: 'A neutral spine with a slight chin tuck reads as composure. Relaxed, never rigid.' },
    { id: 'posture-dn-1', axis: 'posture', category: 'do-not', title: 'DO NOT force military posture all day', instruction: 'Rigid over-correction fatigues and looks tense. Aim for relaxed neutral.' },
  ],
  lifestyle: [
    { id: 'life-1', axis: 'expression', category: 'do', title: 'Sleep 7-8 hours', instruction: 'The single highest-leverage habit for skin, eyes and recovery. Guard the window.' },
    { id: 'life-2', axis: 'eyeArea', category: 'do', title: 'Hydrate through the day', instruction: 'Steady water through the day shows in skin and the under-eye area within days.' },
    { id: 'life-3', axis: 'bodyComposition', category: 'do', title: 'Move daily', instruction: 'A daily walk or training session supports posture, composition and presence. Consistency over intensity.' },
    { id: 'life-4', axis: 'expression', category: 'do', title: 'Ease the jaw and brow', instruction: 'Tension lives in the face. A few conscious resets a day soften a held, guarded expression.' },
    { id: 'life-5', axis: 'eyeArea', category: 'do', title: 'Wind down the screens before bed', instruction: 'A calmer last hour deepens sleep, and sleep shows first in the eyes.' },
    { id: 'life-dn-1', axis: 'bodyComposition', category: 'do-not', title: 'DO NOT trade sleep for one more hour of work', instruction: 'Lost sleep shows on the face faster than almost anything else. Protect the window.' },
  ],
};

// Surfaced when a hair reading suggests the user may want professional input.
// Safe referral only — no drug names, no prescriptions (Phase 1).
const PROFESSIONAL_REFERRAL_NOTE =
  'If the hairline is a real concern for you, this is one for a qualified professional — a dermatologist can give you an objective baseline.';

module.exports = { PROTOCOL_LIBRARY, AXIS_TO_BUCKET, PROFESSIONAL_REFERRAL_NOTE };
