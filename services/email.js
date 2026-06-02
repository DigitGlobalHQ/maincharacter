/**
 * ═══════════════════════════════════════════════════════════════════
 * EMAIL SERVICE — Resend
 * ═══════════════════════════════════════════════════════════════════
 *
 * Transactional email: paywall receipts, Day-7 Evolution Report, audit
 * confirmation, weekly reveal notifications (Night-3 migration).
 *
 * DORMANT until RESEND_API_KEY is set: every send is a logged DRY-RUN and
 * returns a stub `{ result: 'dry-run' }` — no network call.
 *
 * SEND GUARD: shares the messaging kill-switch (lib/messaging-mode). Under
 * `allowlist` only ADMIN_EMAIL (+ EMAIL_ALLOWLIST) receives a real email.
 *
 * Templates live in data/email-templates/*.html with {{placeholder}} tokens.
 * All copy is flagged `<!-- TODO copy review -->` pending founder approval.
 */

const fs = require('fs');
const path = require('path');
const { createLogger } = require('../lib/log');
const mode = require('../lib/messaging-mode');
const { maskEmail } = require('../lib/log-mask');

const log = createLogger('EMAIL');

const TEMPLATE_DIR = path.join(__dirname, '..', 'data', 'email-templates');

function fromAddress() {
  return process.env.RESEND_FROM_EMAIL || 'consultant@maincharacter.digitglobalservices.com';
}
function baseUrl() {
  return process.env.UPGRADE_BASE_URL || 'https://maincharacter.digitglobalservices.com';
}

/** Whether the email path has the minimum credentials to call Resend. */
function isConfigured() {
  return !!process.env.RESEND_API_KEY;
}

// Transport seam: production sends through the Resend SDK; tests inject a stub
// via __setTransport (vi.mock does not intercept this lazy require in our setup).
let _client = null;
let _transport = null;

/** Lazily construct + cache the Resend client (keyed on the current API key). */
function resendClient() {
  if (_client && _client._key === process.env.RESEND_API_KEY) return _client.c;
  const { Resend } = require('resend');
  _client = { c: new Resend(process.env.RESEND_API_KEY), _key: process.env.RESEND_API_KEY };
  return _client.c;
}

/** Send a payload through the active transport. */
function transport(payload) {
  if (_transport) return _transport(payload);
  return resendClient().emails.send(payload);
}

/** Test seam — override the transport. */
function __setTransport(fn) {
  _transport = fn;
}
/** Test seam — restore the real Resend transport. */
function __resetTransport() {
  _transport = null;
  _client = null;
}

/** Escape a value for safe interpolation into HTML. */
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render a template file, substituting {{key}} tokens. Values are HTML-escaped
 * unless the key ends in `_html` (pre-built markup like the score table).
 * @param {string} name template filename
 * @param {Record<string,any>} vars
 * @returns {string}
 */
function renderTemplate(name, vars = {}) {
  let html = fs.readFileSync(path.join(TEMPLATE_DIR, name), 'utf8');
  for (const [k, v] of Object.entries(vars)) {
    const value = k.endsWith('_html') ? String(v ?? '') : esc(v);
    html = html.split(`{{${k}}}`).join(value);
  }
  // Blank any tokens the caller didn't supply.
  html = html.replace(/\{\{[a-zA-Z0-9_]+\}\}/g, '');
  return html;
}

/**
 * Generic send. Respects the messaging guard and DRY-RUN.
 * @param {{to:string, subject:string, html?:string, text?:string, replyTo?:string}} opts
 * @returns {Promise<object>}
 */
async function sendEmail({ to, subject, html, text, replyTo } = {}) {
  if (!to) {
    log.info('SKIP', 'no recipient — not sent');
    return { result: 'no-recipient' };
  }

  const sendMode = mode.getSendMode();
  if (sendMode === 'off') {
    log.info('DRY-RUN', `[mode=off] suppressed email "${subject}" to ${maskEmail(to)}`);
    return { result: 'suppressed', mode: sendMode };
  }
  if (sendMode === 'allowlist' && !mode.isEmailAllowed(to)) {
    log.warn('BLOCKED', `[mode=allowlist] ${maskEmail(to)} not on allowlist — "${subject}" not sent`);
    return { result: 'blocked', mode: sendMode };
  }

  if (!isConfigured()) {
    log.info('DRY-RUN', `credentials not configured. Would have sent "${subject}" to ${maskEmail(to)}`);
    return { result: 'dry-run' };
  }

  const { data, error } = await transport({
    from: fromAddress(),
    to,
    subject,
    html,
    text,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });
  if (error) {
    log.error('FAIL', `Resend error for ${to}: ${error.message || JSON.stringify(error)}`);
    throw new Error(`Resend send failed: ${error.message || 'unknown'}`);
  }
  log.info('SENT', `"${subject}" → ${to} (id=${data && data.id})`);
  return data;
}

/** Format paise → "₹1,499". */
function formatINR(paise) {
  const rupees = Math.round((Number(paise) || 0) / 100);
  return '₹' + rupees.toLocaleString('en-IN');
}

/** Format a date → "27 May 2026". */
function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Send an email magic-link for Lookmaxxing login (Login Gate P0-1).
 * DRY-RUN when RESEND_API_KEY is unset. Returns {result:'no-recipient'} when
 * the user has no email. The token is embedded into the URL only — never logged.
 * `next` (optional) routes the user onward after consume — whitelisted to our
 * own funnel paths, so the magic link can drop a new sign-up straight into the quiz.
 * @param {{user:object, token:string, label?:string, next?:string}} args
 */
async function sendMagicLink({ user, token, label, next } = {}) {
  if (!user || !user.email) return { result: 'no-recipient' };
  const subject = label || '◆ Your Lookmaxxing entry link'; // [copy-consultant TBD] email.magic.subject
  const safeNext = (typeof next === 'string' && /^\/(lookmaxing|lookmax)(\/|$|\?)/.test(next)) ? next : '';
  const url = `${baseUrl()}/lookmax/login?token=${encodeURIComponent(token)}`
    + (safeNext ? `&next=${encodeURIComponent(safeNext)}` : '');
  const html = renderTemplate('magic-link.html', {
    name: user.name || 'Seeker',
    magicLinkUrl: url,
  });
  return sendEmail({ to: user.email, subject, html });
}

/**
 * Send a 6-digit email sign-in code (PR A — Email OTP). DRY-RUN when
 * RESEND_API_KEY is unset. Returns {result:'no-recipient'} when the user has no
 * email. The code is rendered into the email body only — never logged.
 * NOTE: OTP-specific copy is DRAFT pending founder approval (CLAUDE.md §5 / §7);
 * the template strings are marked `<!-- TODO copy review -->`.
 * @param {{user:object, code:string|number}} args
 */
async function sendEmailOtp({ user, code } = {}) {
  if (!user || !user.email) return { result: 'no-recipient' };
  const subject = '◆ Your MainCharacter sign-in code'; // TODO copy review
  const html = renderTemplate('email-otp.html', {
    name: user.name || 'Seeker',
    code: String(code == null ? '' : code),
    preheader: 'Your single-use sign-in code, valid for ten minutes.', // TODO copy review
  });
  return sendEmail({ to: user.email, subject, html });
}

/**
 * Send the post-payment receipt. `plan` may be a plan key or a {label, amount}.
 * Pass `firstLoginToken` to embed the one-shot magic-link URL as a backup entry
 * path in the receipt (spec §6, Login Gate P0-1).
 * @param {{user:object, plan:string|object, subscriptionId?:string, nextBillingDate?:string|Date, firstLoginToken?:string}} args
 */
async function sendPaywallReceipt({ user, plan, subscriptionId, nextBillingDate, firstLoginToken } = {}) {
  if (!user || !user.email) return { result: 'no-recipient' };

  let planLabel = 'Subscription';
  let amountPaise = 0;
  if (typeof plan === 'string') {
    const { PLANS } = require('./razorpay');
    const p = PLANS[plan];
    if (p) {
      planLabel = p.label;
      amountPaise = p.amount;
    }
  } else if (plan && typeof plan === 'object') {
    planLabel = plan.label || planLabel;
    amountPaise = plan.amount || 0;
  }

  const next = nextBillingDate
    ? new Date(nextBillingDate)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  // Build the magic-link backup section if a firstLoginToken was supplied.
  // This is the belt-and-braces recovery path for the F2 failure mode (tab closed).
  // The token is URL-encoded and embedded into the button href — never logged.
  let magicLinkSection_html = '';
  if (firstLoginToken) {
    const magicUrl = `${baseUrl()}/lookmax/login?token=${encodeURIComponent(firstLoginToken)}`;
    // [copy-consultant TBD] receipt.firstLogin.line + receipt.firstLogin.cta
    magicLinkSection_html = `
            <tr>
              <td style="padding:0 40px 16px;text-align:center;color:#b9b6ae;font-size:14px;line-height:1.7;">
                If the tab from your payment is still open, the button there will walk you in silently. If it closed, the link below does the same — valid for fifteen minutes, single use.
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 24px;text-align:center;">
                <a href="${esc(magicUrl)}" style="display:inline-block;background:transparent;color:#e8b84b;text-decoration:none;font-weight:600;font-size:14px;padding:12px 28px;border-radius:8px;border:1px solid #e8b84b;">
                  Enter Lookmaxxing
                </a>
              </td>
            </tr>`;
  }

  const html = renderTemplate('paywall-receipt.html', {
    name: user.name || 'Seeker',
    planLabel,
    amount: formatINR(amountPaise),
    nextBillingDate: formatDate(next),
    dashboardUrl: `${baseUrl()}/dashboard/${user.token || ''}`,
    subscriptionId: subscriptionId || '—',
    magicLinkSection_html,
  });

  return sendEmail({
    to: user.email,
    subject: 'The Chamber is open — your MainCharacter subscription is confirmed',
    html,
  });
}

/**
 * Send the audit confirmation with a magic link back to the result page.
 * @param {{user:object, auditSessionToken:string}} args
 */
async function sendAuditConfirmation({ user, auditSessionToken } = {}) {
  if (!user || !user.email) return { result: 'no-recipient' };
  const html = renderTemplate('audit-confirmation.html', {
    name: user.name || 'Seeker',
    resultUrl: `${baseUrl()}/audit/result/${auditSessionToken || ''}`,
  });
  return sendEmail({
    to: user.email,
    subject: 'Your Aesthetic Audit is saved',
    html,
  });
}

const SCORE_LABELS = {
  fluency: 'Fluency',
  confidenceTone: 'Confidence & Tone',
  fillerFrequency: 'Filler Control',
  vocabularyRange: 'Vocabulary Range',
  structure: 'Structure',
};

/** Build the <tr> rows for the score table from a score record. */
function buildScoreRows(score) {
  if (!score) return '';
  return Object.entries(SCORE_LABELS)
    .filter(([k]) => score[k] != null)
    .map(
      ([k, label]) =>
        `<tr><td style="padding:10px 8px;border-bottom:1px solid #141416;color:#f4f1ea;font-size:14px;">${label}</td>` +
        `<td style="padding:10px 8px;border-bottom:1px solid #141416;color:#e8b84b;font-size:14px;text-align:right;font-weight:600;">${esc(score[k])}</td></tr>`
    )
    .join('');
}

/** Build gold lexicon pills from wordsLearned. */
function buildLexiconPills(wordsLearned = []) {
  return wordsLearned
    .map((w) => {
      const mastered = w.status === 'mastered';
      const style = mastered
        ? 'background:#e8b84b;color:#070708;'
        : 'background:transparent;color:#e8b84b;border:1px solid #e8b84b;';
      return `<span style="display:inline-block;${style}font-size:12px;font-weight:600;padding:5px 12px;border-radius:20px;margin:0 6px 8px 0;">${esc(w.word)}</span>`;
    })
    .join('');
}

/**
 * Send the HTML Day-7 Evolution Report. Reads scores + lexicon off the user.
 * @param {{user:object, assessment?:string}} args
 */
async function sendDay7EvolutionReport({ user, assessment } = {}) {
  if (!user || !user.email) return { result: 'no-recipient' };

  const scores = user.scores || [];
  const latest = scores.find((s) => s.day === 7) || scores[scores.length - 1] || null;

  const html = renderTemplate('day7-evolution-report.html', {
    name: user.name || 'Seeker',
    rank: (user.rank || 'seeker').toUpperCase(),
    assessment: assessment || 'Your seven days are recorded. The work continues.', // TODO copy review
    scoreRows_html: buildScoreRows(latest),
    lexiconPills_html: buildLexiconPills(user.wordsLearned || []),
    upgradeUrl: `${baseUrl()}/upgrade`,
  });

  return sendEmail({
    to: user.email,
    subject: 'Your Evolution Report — seven days with The Consultant',
    html,
  });
}

module.exports = {
  sendEmail,
  sendMagicLink,
  sendEmailOtp,
  sendPaywallReceipt,
  sendAuditConfirmation,
  sendDay7EvolutionReport,
  renderTemplate,
  isConfigured,
  __setTransport,
  __resetTransport,
};
