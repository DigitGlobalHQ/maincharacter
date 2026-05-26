/**
 * ═══════════════════════════════════════════════════════════════════
 * HAIR SERVICE — evidence-based Norwood recommendations (Night-4, P6.3)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Static, stage-aware DO / DO-NOT library keyed by Norwood stage. Each entry
 * carries an evidenceTier (1 RCT / 2 mechanism / 3 observational). The DO-NOT
 * list is always populated. Founder receives the full set, unfiltered
 * (DECISIONS.md Night-4 #7).
 *
 * ⚠ All copy // TODO copy review (BACKLOG). Medical framing, not yet approved voice.
 */

const { FINASTERIDE_NOTE } = require('../data/lookmax-content');

const tier = (title, evidenceTier) => ({ title, evidenceTier });

// Norwood 2-3 forms the base "early-intervention" DO set, reused at 4-5.
const EARLY_DO = [
  tier('Minoxidil 5% topical, 1ml AM', 1),
  tier('Ketoconazole 2% shampoo, 2-3x/week', 1),
  tier('Microneedling 0.5-1mm, weekly (with minoxidil)', 1),
  tier('10 minutes direct sunlight before 9am', 3),
  tier('Scalp massage, 3 minutes daily', 3),
];

const EARLY_DONT = [
  tier('DO NOT rely on at-home laser combs', 3),
  tier('DO NOT take biotin unless deficient', 3),
  tier('DO NOT substitute saw palmetto for minoxidil', 3),
  tier('DO NOT pull or tug at the hairline', 3),
];

/**
 * Recommendations for a Norwood stage (1-7). Returns { do:[], doNot:[] } where
 * each item is { title, evidenceTier }.
 * @param {number} norwood
 */
function recommendationsForNorwood(norwood) {
  const n = Math.max(1, Math.min(7, Math.round(Number(norwood) || 1)));

  if (n === 1) {
    return {
      do: [
        tier('Ketoconazole 2% shampoo, 2x/week (preventive)', 1),
        tier('Sunscreen on the scalp if balding-prone', 2),
        tier('Sleep on a silk pillowcase', 3),
      ],
      doNot: [
        tier('DO NOT start minoxidil yet — no recession to treat', 2),
        tier('DO NOT buy expensive shampoos with unproven actives', 3),
        tier('DO NOT do daily ACV rinses', 3),
      ],
    };
  }

  if (n <= 3) {
    return { do: [...EARLY_DO], doNot: [...EARLY_DONT] };
  }

  if (n <= 5) {
    return {
      do: [...EARLY_DO, tier(`Discuss finasteride with a dermatologist — ${FINASTERIDE_NOTE}`, 1)],
      doNot: [
        ...EARLY_DONT,
        tier('DO NOT skip the dermatologist consult', 2),
        tier('DO NOT expect minoxidil alone to fully reverse this', 1),
      ],
    };
  }

  // Norwood 6-7
  return {
    do: [
      tier('Consult a board-certified hair surgeon about FUE transplant', 1),
      tier('Minoxidil + finasteride to preserve remaining hair', 1),
      tier('Ketoconazole 2% shampoo, 2-3x/week', 1),
    ],
    doNot: [
      tier('DO NOT continue topicals alone expecting full restoration', 1),
      tier('DO NOT delay the surgical consult — donor density declines with time', 2),
      tier('DO NOT chase miracle products online', 3),
    ],
  };
}

/**
 * One Consultant-voice observation for a hair reading. Deterministic + brand-safe.
 * // TODO copy review.
 * @param {{ norwood:number, confidence:string }} result
 * @param {number|null} deltaVsFirst hairline-score change vs first reading
 */
function consultantLine(result, deltaVsFirst) {
  if (result && result.confidence === 'low') {
    return 'The light was not on your side this week. Flat overhead light next time, and the read sharpens. ◆';
  }
  if (deltaVsFirst == null) {
    return 'Baseline recorded. The temples and crown are the leverage points. The work starts now. ◆';
  }
  if (deltaVsFirst > 0) {
    return `The hairline gained ${deltaVsFirst}. Adherence is doing its work. Hold the protocol. ◆`;
  }
  if (deltaVsFirst < 0) {
    return `The reading slipped ${Math.abs(deltaVsFirst)}. Note it, tighten adherence, and let the next month answer. ◆`;
  }
  return 'The hairline held. Holding is its own kind of progress here. ◆';
}

module.exports = { recommendationsForNorwood, consultantLine };
