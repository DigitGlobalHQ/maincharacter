/**
 * ═══════════════════════════════════════════════════════════════════
 * GEMINI HEALTH — key VALIDITY probe (funnel-repair)
 * ═══════════════════════════════════════════════════════════════════
 *
 * `/health` previously reported `gemini: !!GEMINI_API_KEY` — key PRESENCE only.
 * A leaked/revoked key (403 "API key was reported as leaked") stayed green while
 * every real reading silently fell back to generic copy. This module does a tiny
 * live `generateContent` and classifies the result, cached so /health stays fast.
 *
 *   status: 'ok' | 'leaked' | 'invalid_key' | 'rate_limited' | 'error' |
 *           'unconfigured' | 'unchecked'
 *
 * getStatus() never blocks: it returns the cached snapshot and kicks a background
 * refresh when stale. init() runs one probe on boot.
 */

'use strict';

const { createLogger } = require('./log');

const log = createLogger('GEMINI-HEALTH');

const TTL_MS = 10 * 60 * 1000; // re-probe at most every 10 minutes
const PROBE_TIMEOUT_MS = 8000;

let cache = { status: 'unchecked', checkedAt: null, detail: null };
let inflight = null;

/** Classify a Gemini SDK error into a stable status string. */
function classifyError(err) {
  const msg = String((err && err.message) || err || '').toLowerCase();
  const code = err && (err.status || err.statusCode);
  if (msg.includes('leaked')) return 'leaked';
  if (code === 429 || msg.includes('rate') || msg.includes('quota') || msg.includes('resource_exhausted')) {
    return 'rate_limited';
  }
  if (code === 400 || code === 401 || code === 403 || msg.includes('api key') || msg.includes('api_key') || msg.includes('permission')) {
    return 'invalid_key';
  }
  return 'error';
}

/** Build the default model lazily (so a missing key never throws at require-time). */
function defaultModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  return new GoogleGenerativeAI(key).getGenerativeModel({ model: modelName });
}

/**
 * Run one validity probe. Returns a snapshot {status, checkedAt, detail}.
 * @param {object} [model] injectable for tests; defaults to a live model.
 */
async function probe(model) {
  if (!process.env.GEMINI_API_KEY) {
    cache = { status: 'unconfigured', checkedAt: new Date().toISOString(), detail: null };
    return cache;
  }
  const m = model || defaultModel();
  if (!m) {
    cache = { status: 'unconfigured', checkedAt: new Date().toISOString(), detail: null };
    return cache;
  }
  try {
    const call = m.generateContent('ping');
    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), PROBE_TIMEOUT_MS));
    await Promise.race([call, timeout]);
    cache = { status: 'ok', checkedAt: new Date().toISOString(), detail: null };
  } catch (err) {
    const status = classifyError(err);
    cache = { status, checkedAt: new Date().toISOString(), detail: String((err && err.message) || err).slice(0, 160) };
    if (status === 'leaked' || status === 'invalid_key') {
      log.error('PROBE', `Gemini key ${status} — real readings will fall back. Rotate GEMINI_API_KEY.`);
    } else {
      log.warn('PROBE', `Gemini probe ${status}: ${cache.detail}`);
    }
  }
  return cache;
}

function isStale() {
  if (!cache.checkedAt) return true;
  return Date.now() - new Date(cache.checkedAt).getTime() > TTL_MS;
}

/** Non-blocking: return the cached snapshot, refreshing in the background if stale. */
function getStatus() {
  if (isStale() && !inflight) {
    inflight = probe().finally(() => { inflight = null; });
  }
  return { ...cache };
}

/** Fire one probe on boot (non-blocking). */
function init() {
  if (!inflight) {
    inflight = probe().finally(() => { inflight = null; });
  }
}

module.exports = { probe, getStatus, init, classifyError, _reset: () => { cache = { status: 'unchecked', checkedAt: null, detail: null }; inflight = null; } };
