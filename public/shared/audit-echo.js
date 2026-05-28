/**
 * public/shared/audit-echo.js
 * Shared audit-echo helper — loaded via <script src="/shared/audit-echo.js">.
 * Consumed by paywall.html and paywall-waitlist.html.
 *
 * Exports two globals: AUDIT_AXIS_LABELS (object) and loadAuditEcho(token, elementId).
 * No module bundler. No framework. No side-effects on load.
 */

/* global window */

// SHARED: keep in sync with paywall.html AXIS_LABELS.
// Single source of truth: any label change must happen here only.
window.AUDIT_AXIS_LABELS = {
  skinClarity: 'Skin clarity',
  jawDefinition: 'Jaw definition',
  eyeArea: 'Eye area',
  hairDensity: 'Hair density',
  posture: 'Posture',
  facialHarmony: 'Facial harmony',
  expression: 'Expression',
  bodyComposition: 'Body composition',
};

/**
 * loadAuditEcho(token, elementId)
 *
 * Fetches the audit result for `token` and populates the element identified by
 * `elementId` with the 1-line Aura summary. Shows the element on success; on
 * any non-OK response (404 expired, 409 incomplete, network error) it silently
 * hides the element — the page still works without it.
 *
 * @param {string|null} token          — the auditSessionToken from the query string
 * @param {string}      elementId      — the id of the .audit-summary element to populate
 */
window.loadAuditEcho = async function loadAuditEcho(token, elementId) {
  if (!token) return;
  const el = document.getElementById(elementId);
  if (!el) return;
  try {
    const res = await fetch('/api/audit/result/' + encodeURIComponent(token));
    if (!res.ok) return; // expired or not complete — show nothing (DPDPA-safe)
    const data = await res.json();
    const vals = Object.values(data.scores || {});
    if (!vals.length) return;
    const aura = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    const leverage = window.AUDIT_AXIS_LABELS[data.weakestAxis] || 'your weakest axis';
    el.innerHTML = 'Your Aura Score: <b>' + aura + '/100</b>. ' + leverage + ' is your leverage point.';
    el.style.display = 'block';
  } catch (_e) { /* non-fatal — form still works */ }
};
