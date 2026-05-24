/**
 * ═══════════════════════════════════════════════════════════════════
 * WATI API SERVICE — WhatsApp messaging via Wati
 * ═══════════════════════════════════════════════════════════════════
 */

const axios = require('axios');

const WATI_API_KEY = process.env.WATI_API_KEY || '';
const WATI_BASE_URL = (process.env.WATI_BASE_URL || '').replace(/\/$/, '');

function log(tag, msg) {
  console.log(`[${new Date().toISOString()}] [WATI:${tag}] ${msg}`);
}

/**
 * Send a session message to a phone number.
 * Wati requires messageText as a query parameter.
 */
async function sendMessage(phone, text) {
  // EMERGENCY KILL SWITCH — no messages sent until spam is resolved
  log('BLOCKED', `Would send to ${phone}: ${text.substring(0, 80)}...`);
  return { result: 'blocked' };
}

/**
 * Send a template message (for users without active session).
 */
async function sendTemplateMessage(phone, templateName, parameters = []) {
  if (!WATI_API_KEY || !WATI_BASE_URL) {
    log('DRY-RUN', `Would send template ${templateName} to ${phone}`);
    return { result: 'dry-run' };
  }

  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;

  try {
    const url = `${WATI_BASE_URL}/api/v1/sendTemplateMessage/${phone}`;
    const response = await axios.post(url, {
      template_name: templateName,
      broadcast_name: 'maincharacter_' + Date.now(),
      parameters: parameters.map(p => ({ name: p.name, value: p.value })),
    }, {
      headers: {
        'Authorization': `Bearer ${WATI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    });

    log('TEMPLATE', `→ ${phone} template=${templateName} status=${response.status}`);
    return response.data;
  } catch (err) {
    log('TEMPLATE-ERROR', `Failed template to ${phone}: ${err.message}`);
    throw err;
  }
}

/**
 * Send message with retry (1 attempt).
 */
async function sendMessageSafe(phone, text) {
  try {
    return await sendMessage(phone, text);
  } catch (err) {
    log('RETRY', `Retrying once for ${phone}...`);
    try {
      await new Promise(r => setTimeout(r, 2000));
      return await sendMessage(phone, text);
    } catch (retryErr) {
      log('FAIL', `Both attempts failed for ${phone}`);
      return null;
    }
  }
}

module.exports = {
  sendMessage,
  sendMessageSafe,
  sendTemplateMessage,
};
