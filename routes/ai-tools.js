/**
 * routes/ai-tools.js — paid AI image tools (token-spending). Mounted at
 * /api/lookmax/ai. Each call: auth → spend tokens → generate → return images.
 * Tokens are REFUNDED if generation fails, so a user is never charged for nothing.
 * Generation runs against the user's uploaded photo to preserve identity.
 */
const express = require('express');
const { requireLookmaxAuth } = require('../lib/lookmax-auth');
const User = require('../models/User');
const geminiImage = require('../services/gemini-image');
const { TOOL_COSTS } = require('./tokens');
const events = require('../services/events');
const { createLogger } = require('../lib/log');

const log = createLogger('AI-TOOLS');
const router = express.Router();

// Every prompt preserves the subject's identity; the model edits the SAME person.
var ID = 'Edit this exact person\'s photo. Preserve their identity, bone structure, ' +
  'skin tone and likeness completely — it must still clearly be the same individual. ' +
  'Photorealistic, natural lighting, same framing. ';

function customStudioPrompt(o) {
  o = o || {};
  var parts = [];
  if (o.hair) parts.push('restyle the hair as: ' + o.hair);
  if (o.hairColor) parts.push('hair colour: ' + o.hairColor);
  if (o.facialHair) parts.push('facial hair: ' + o.facialHair);
  if (o.makeup) parts.push('apply tasteful makeup: ' + o.makeup);
  if (o.outfit) parts.push('outfit: ' + o.outfit);
  if (o.skin) parts.push('improve skin: ' + o.skin);
  if (o.age) parts.push('shift apparent age: ' + o.age);
  if (!parts.length) parts.push('a subtle, well-groomed polish — tidy hair, even skin, good posture');
  return ID + 'Apply only these changes: ' + parts.join('; ') + '. Keep everything else identical.';
}

var PROMPTS = {
  customStudio: function (o) { return customStudioPrompt(o); },
  procedurePreview: function (o) {
    var p = (o && o.procedure) || 'a subtle, natural aesthetic refinement';
    return ID + 'Show a realistic, conservative preview of: ' + p + '. Keep it natural and believable — ' +
      'the kind of subtle result a skilled practitioner would aim for, never exaggerated.';
  },
  hairstylePack: function (o) {
    var shape = (o && o.faceShape) ? (' suited to a ' + o.faceShape + ' face shape') : '';
    return ['a sharp modern textured crop', 'a classic side part', 'a longer swept-back style',
      'a clean buzz/short fade', 'a relaxed natural curls/length style'].map(function (s) {
      return ID + 'Restyle ONLY the hair as ' + s + shape + '. Keep the face, skin and outfit identical.';
    });
  },
  timeMachine: function () {
    return [ID + 'Show this person about 10 years YOUNGER — smoother skin, fuller hair, no change to identity.',
      ID + 'Show this person about 10 years OLDER — natural ageing, some greying, mature skin, same identity.'];
  },
  glowUp: function () {
    return [ID + 'The best realistic version of this person — great hair, clear skin, good grooming, confident posture, all at once.',
      ID + 'Change ONLY the hairstyle to the most flattering cut for them. Everything else identical.',
      ID + 'Improve ONLY grooming — tidy brows, clean facial hair, neat hairline. Everything else identical.',
      ID + 'Improve ONLY the skin — even tone, clear, healthy, hydrated. Everything else identical.',
      ID + 'Improve ONLY styling — a sharp, well-fitted outfit and collar. Face and hair identical.'];
  },
  fullAnalysis: function () {
    return [ID + 'The optimised, realistic best version of this person with their top improvements applied together — hair, skin, grooming, styling and posture.'];
  },
};

function cleanB64(s) { return String(s || '').replace(/^data:[^;]+;base64,/, ''); }

// ─── POST /generate { tool, photo(base64), options } ───
router.post('/generate', requireLookmaxAuth, async (req, res) => {
  const { tool, photo, options } = req.body || {};
  const cost = TOOL_COSTS[tool];
  if (!cost) return res.status(400).json({ error: 'unknown tool' });
  const photoBase64 = cleanB64(photo);
  if (!photoBase64 || photoBase64.length < 100) return res.status(400).json({ error: 'a photo is required' });

  const user = req.lookmaxUser;
  const spend = await User.spendTokens(user.phone, cost);
  if (!spend.ok) {
    return res.status(402).json({ error: 'insufficient_tokens', need: cost, tokens: spend.tokens || 0 });
  }

  try {
    const prompts = PROMPTS[tool](options || {});
    const out = await geminiImage.generate({ photoBase64: photoBase64, mimeType: 'image/jpeg', prompts: prompts });
    events.trackAnonymous('ai_tool_generated', { tool: tool, mock: out.mock }, user.token).catch(() => {});
    log.info('GEN', `${tool} (-${cost} tok) → ${out.images.length} img${out.mock ? ' [mock]' : ''} for ${user.token.slice(0, 8)}`);
    return res.json({ tool: tool, images: out.images, mock: out.mock, tokensLeft: spend.tokens, count: out.images.length });
  } catch (err) {
    // Refund — never charge for a failed generation.
    await User.addTokens(user.phone, cost);
    log.error('GEN', `${tool} failed, refunded ${cost}: ${err.message}`);
    return res.status(502).json({ error: 'generation_failed', refunded: cost });
  }
});

module.exports = router;
module.exports.PROMPTS = PROMPTS;
