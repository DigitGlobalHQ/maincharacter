/**
 * ═══════════════════════════════════════════════════════════════════
 * HAIR SERVICE — stage-aware grooming guidance (SAFE-ONLY, Phase 1 2026-05-30)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Static, stage-aware DO / DO-NOT library keyed by a coarse hairline reading.
 *
 * SAFETY (CLAUDE.md §safety): MainCharacter is NOT a medical service. This file
 * was rewritten in Phase 1 to remove ALL pharmacological and procedural content
 * (minoxidil, finasteride, ketoconazole, microneedling, transplants, dosages,
 * RCT framing). It now coaches only the allow-list: cut & style that works with
 * the hairline, scalp sun protection, gentle washing, sleep/stress — plus an
 * honest referral to a qualified professional when recession is the real
 * concern. Every line also passes lib/safety-validator.js before it ships.
 */

const { PROFESSIONAL_REFERRAL_NOTE } = require('../data/lookmax-content');
const { sanitizeProtocolDay } = require('../lib/safety-validator');

const item = (title, instruction = '') => ({ title, instruction });

// Base "early" DO set, reused across mild/moderate readings.
const EARLY_DO = [
  item('A cut that works with the hairline', 'Ask a barber for a shape that suits your current hairline rather than fighting it. The right cut does more than any product.'),
  item('Keep the scalp clean on a rhythm', 'Wash on a steady cadence with a gentle shampoo. A calm, clean scalp reads better than chasing actives.'),
  item('Sun protection for the crown', 'Shade or a cap in strong midday sun, especially where coverage is thinner.'),
  item('Protect sleep and ease stress', 'Both show in hair condition over weeks. The unglamorous basics are the leverage.'),
];

const EARLY_DONT = [
  item('DO NOT chase miracle products online', 'Most viral hair products promise far more than they deliver. Spend the energy on a good cut and steady basics.'),
  item('DO NOT pull or tug at the hairline', 'Tight styles and constant tugging stress the hairline. Keep tension off it.'),
  item('DO NOT obsess over a daily count', 'Hair shifts slowly. Checking it under harsh light every morning only feeds anxiety.'),
];

/**
 * Grooming-and-style guidance for a coarse hairline reading (1-7, where higher
 * means more recession). Returns { do:[], doNot:[] } of { title, instruction }.
 * No treatments, no drug names — style, care, and an honest referral only.
 * @param {number} norwood coarse hairline-reading bucket (kept for call-site compatibility)
 */
function recommendationsForNorwood(norwood) {
  const n = Math.max(1, Math.min(7, Math.round(Number(norwood) || 1)));

  let result;
  if (n === 1) {
    result = {
      do: [
        item('Find your best length now', 'A full hairline gives you options. Settle on a cut and parting that flatter your face shape.'),
        item('Keep the scalp clean on a rhythm', 'Gentle, regular washing keeps the scalp healthy and the hair looking its best.'),
        item('Protect sleep', 'Consistent sleep shows in hair condition. The earliest, easiest habit to lock in.'),
      ],
      doNot: [
        item('DO NOT over-wash', 'Daily harsh washing strips the scalp. Gentle and regular beats aggressive.'),
        item('DO NOT buy products for problems you do not have', 'A full hairline does not need a cabinet of actives. Keep it simple.'),
      ],
    };
  } else if (n <= 3) {
    result = { do: [...EARLY_DO], doNot: [...EARLY_DONT] };
  } else if (n <= 5) {
    result = {
      do: [...EARLY_DO, item('Consider talking to a professional', PROFESSIONAL_REFERRAL_NOTE)],
      doNot: [
        ...EARLY_DONT,
        item('DO NOT rely on internet forums for answers', 'If you want to explore options beyond styling, a qualified professional is the right call — not a forum thread.'),
      ],
    };
  } else {
    // Heavier recession — style choices plus an honest referral.
    result = {
      do: [
        item('Own the shorter look', 'A clean, short crop or a confident shave reads stronger than thin coverage stretched over the crown. Many of the sharpest faces wear it this way.'),
        item('Invest in the beard and frame', 'A well-kept beard and strong grooming shift the eye and balance the face. This is where the leverage is now.'),
        item('Talk to a professional if it weighs on you', PROFESSIONAL_REFERRAL_NOTE),
      ],
      doNot: [
        item('DO NOT comb thin hair over the gap', 'It draws the eye to exactly what you want to soften. A clean shorter cut always reads better.'),
        item('DO NOT chase miracle restoration products', 'Online "restoration" products overwhelmingly disappoint. Put the energy into a great cut and frame.'),
      ],
    };
  }

  // Server-side safety backstop before anything ships (Phase 1).
  const { day } = sanitizeProtocolDay(result);
  return { do: day.do, doNot: day.doNot };
}

/**
 * One Consultant-voice observation for a hair reading. Deterministic + brand-safe.
 * @param {{ norwood:number, confidence:string }} result
 * @param {number|null} deltaVsFirst hairline-score change vs first reading
 */
function consultantLine(result, deltaVsFirst) {
  if (result && result.confidence === 'low') {
    return 'The light was not on your side this week. Flat overhead light next time, and the read sharpens. ◆';
  }
  if (deltaVsFirst == null) {
    return 'Baseline recorded. The cut, the frame, the grooming — that is where presence is won. The work starts now. ◆';
  }
  if (deltaVsFirst > 0) {
    return `The hairline read gained ${deltaVsFirst}. Whatever you are doing for sleep and care, hold it. ◆`;
  }
  if (deltaVsFirst < 0) {
    return `The reading slipped ${Math.abs(deltaVsFirst)}. Note it, hold the basics, and let the next month answer. ◆`;
  }
  return 'The hairline held. Holding is its own kind of progress here. ◆';
}

module.exports = { recommendationsForNorwood, consultantLine };
