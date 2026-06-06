/**
 * services/gemini-image.js — identity-preserving image edits via Gemini 2.5
 * Flash Image ("nano-banana"). Takes the user's photo + a prompt and returns one
 * or more edited images as base64. Falls back to a MOCK (echoes the original) when
 * GEMINI_API_KEY is unset, so the whole token→tool flow is testable without a key
 * and without spending money. The live model is verified by the founder on prod.
 */
const { createLogger } = require('../lib/log');
const log = createLogger('GEMINI-IMG');

const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';

function configured() { return !!process.env.GEMINI_API_KEY; }

/**
 * Edit a single image with a prompt. Returns base64 PNG/JPEG data (no data: prefix).
 * @param {{ photoBase64:string, mimeType?:string, prompt:string }} opts
 * @returns {Promise<string>} edited image base64
 */
async function editOnce({ photoBase64, mimeType = 'image/jpeg', prompt }) {
  if (!configured()) return photoBase64; // mock: echo original
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL +
    ':generateContent?key=' + encodeURIComponent(process.env.GEMINI_API_KEY);
  const body = {
    contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: photoBase64 } }] }],
    generationConfig: { responseModalities: ['IMAGE'] },
  };
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    throw new Error('gemini-image ' + r.status + ' ' + t.slice(0, 160));
  }
  const j = await r.json();
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const imgPart = parts.find(function (p) { return p.inlineData && p.inlineData.data; });
  if (!imgPart) throw new Error('gemini-image: no image in response');
  return imgPart.inlineData.data;
}

/**
 * Generate `count` edited variants. Prompts may be a single string (reused) or an
 * array (one per variant). Returns { mock, images: [base64] }.
 */
async function generate({ photoBase64, mimeType, prompts, count }) {
  const list = Array.isArray(prompts) ? prompts : Array.from({ length: count || 1 }, function () { return prompts; });
  const images = [];
  for (var i = 0; i < list.length; i++) {
    images.push(await editOnce({ photoBase64: photoBase64, mimeType: mimeType, prompt: list[i] }));
  }
  log.info('GEN', (configured() ? 'live' : 'mock') + ' produced ' + images.length + ' image(s)');
  return { mock: !configured(), images: images };
}

module.exports = { generate, editOnce, configured, MODEL };
