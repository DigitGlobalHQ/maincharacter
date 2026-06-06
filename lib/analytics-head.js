/**
 * lib/analytics-head.js
 * Builds the <head> snippet for Google Analytics (GA4) + Google Search Console
 * verification, driven entirely by env vars so nothing ships hard-coded:
 *   GA_MEASUREMENT_ID   e.g. G-XXXXXXXXXX  → injects the gtag.js loader + config
 *   GSC_VERIFICATION    the content token  → injects <meta google-site-verification>
 * Returns '' when neither is set, so it is a no-op until the founder configures it.
 * Values are sanitised (Google ids are alnum + -/_), so a stray env can't inject HTML.
 */

function _san(v, re) {
  return v && typeof v === 'string' && re.test(v) ? v : '';
}

function analyticsHead() {
  const ga = _san(process.env.GA_MEASUREMENT_ID, /^[A-Za-z0-9\-_]{4,40}$/);
  const gsc = _san(process.env.GSC_VERIFICATION, /^[A-Za-z0-9\-_]{8,128}$/);
  let h = '';
  if (gsc) {
    h += `<meta name="google-site-verification" content="${gsc}">`;
  }
  if (ga) {
    h += `<script async src="https://www.googletagmanager.com/gtag/js?id=${ga}"></script>`
      + `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}`
      + `gtag('js',new Date());gtag('config','${ga}');</script>`;
  }
  return h;
}

module.exports = { analyticsHead };
