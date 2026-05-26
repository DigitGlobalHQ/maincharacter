/**
 * ═══════════════════════════════════════════════════════════════════
 * USER MODEL — JSON-file-backed database
 * ═══════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Paths can be overridden via env (used by tests to avoid touching real data).
const USERS_FILE = process.env.USERS_FILE_PATH || path.join(__dirname, '..', 'data', 'users.json');
const WAITLIST_FILE =
  process.env.WAITLIST_FILE_PATH || path.join(__dirname, '..', 'data', 'waitlist.json');

// Ensure data directory and files exist
function ensureFiles() {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
  if (!fs.existsSync(WAITLIST_FILE)) fs.writeFileSync(WAITLIST_FILE, '[]');
}

ensureFiles();

// ═══════════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════════

function loadUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

/**
 * Create a new user. Returns the created user object.
 */
function createUser({ name, phone, pillar = 'orator', preferredTime = '08:00' }) {
  const users = loadUsers();
  
  // Normalise phone: strip +, spaces, ensure 91 prefix
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;

  // Check if user already exists
  if (users[phone]) {
    return users[phone];
  }

  const token = crypto.randomUUID();

  const user = {
    token,
    name,
    phone,
    pillar,
    preferredTime,
    enrolledAt: new Date().toISOString(),
    day: 0,                    // 0 = enrolled, not started
    status: 'active',          // active | paused | completed | subscribed
    trialComplete: false,
    awaitingResponse: false,   // true when morning msg sent, waiting for reply
    lastMorningSent: null,     // ISO date string of last morning message
    lastEveningSent: null,     // ISO date string of last evening message
    scores: [],                // [{day, fluency, confidenceTone, fillerFrequency, vocabularyRange, structure, timestamp}]
    wordsLearned: [],          // [{word, definition, day, status:'forged'|'mastered'}]
    chronicle: [],             // [{day, prompt, userResponse, consultantResponse, timestamp}]
    rank: 'unawakened',        // unawakened | seeker | ascendant | luminary | sovereign
    streak: 0,
    lastActive: new Date().toISOString(),
    subscriptionStatus: 'trial', // trial | active | cancelled
    razorpayCustomerId: null,
    notes: '',

    // ── Night-2: Lookmaxxing + Aura++ (P0.5) ──
    email: null,                 // optional secondary identifier (receipts/digests)
    oratorActive: false,         // paid Orator subscription live
    lookmaxxingActive: false,    // paid Lookmaxxing subscription live
    // auraPlusPlus is computed, never stored — see computeAuraStatus().
    mirrorLevel: 'raw',          // raw | polished | magnetic | radiant | sovereign
    auditSessionId: null,        // links to the AuditSession that converted them
    lookmaxxingStartedAt: null,  // ISO date Lookmaxxing protocol began (Day-30 trigger)
    pushSubscription: null,      // web-push PushSubscription JSON (PWA notifications)
  };

  users[phone] = user;
  saveUsers(users);
  return user;
}

/**
 * Get user by phone number.
 */
function getUserByPhone(phone) {
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  const users = loadUsers();
  return users[phone] || null;
}

/**
 * Get user by dashboard token.
 */
function getUserByToken(token) {
  const users = loadUsers();
  return Object.values(users).find(u => u.token === token) || null;
}

/**
 * Get user by their Razorpay subscription id (set at checkout). Used by the
 * post-payment confirmation page (P6).
 * @param {string} subscriptionId
 */
function getUserBySubscriptionId(subscriptionId) {
  if (!subscriptionId) return null;
  const users = loadUsers();
  return Object.values(users).find(u => u.razorpaySubscriptionId === subscriptionId) || null;
}

/**
 * Update user fields (partial update).
 */
function updateUser(phone, updates) {
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  const users = loadUsers();
  if (!users[phone]) return null;

  Object.assign(users[phone], updates, { lastActive: new Date().toISOString() });
  saveUsers(users);
  return users[phone];
}

/**
 * Add a score entry for a specific day.
 */
function addScore(phone, scoreEntry) {
  const users = loadUsers();
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  if (!users[phone]) return null;

  users[phone].scores.push({
    ...scoreEntry,
    timestamp: new Date().toISOString(),
  });
  saveUsers(users);
  return users[phone];
}

/**
 * Add a chronicle (conversation log) entry.
 */
function addChronicle(phone, entry) {
  const users = loadUsers();
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  if (!users[phone]) return null;

  users[phone].chronicle.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  saveUsers(users);
  return users[phone];
}

/**
 * Add words learned for a specific day.
 */
function addWordsLearned(phone, words, day) {
  const users = loadUsers();
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  if (!users[phone]) return null;

  words.forEach(w => {
    // Check if word already exists
    const existing = users[phone].wordsLearned.find(wl => wl.word === w.word);
    if (!existing) {
      users[phone].wordsLearned.push({
        word: w.word,
        definition: w.definition,
        day,
        status: 'forged',
      });
    }
  });
  saveUsers(users);
  return users[phone];
}

/**
 * Mark a word as mastered.
 */
function masterWord(phone, word) {
  const users = loadUsers();
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  if (!users[phone]) return null;

  const w = users[phone].wordsLearned.find(wl => wl.word.toUpperCase() === word.toUpperCase());
  if (w) w.status = 'mastered';
  saveUsers(users);
  return users[phone];
}

/**
 * Get all users.
 */
function getAllUsers() {
  return loadUsers();
}

/**
 * Get active users who need their message at the given time.
 */
function getUsersForTime(timeStr) {
  const users = loadUsers();
  return Object.values(users).filter(u =>
    u.status === 'active' &&
    u.preferredTime === timeStr &&
    !u.awaitingResponse &&
    u.day < 7
  );
}

/**
 * Get users who need their evening score at the given time.
 * Evening = preferredTime + 12 hours.
 */
function getUsersForEveningTime(timeStr) {
  const users = loadUsers();
  return Object.values(users).filter(u => {
    if (u.status !== 'active' || u.day < 1 || u.day > 7) return false;
    // Calculate evening time (preferred + 12h)
    const [h] = u.preferredTime.split(':').map(Number);
    const eveningH = (h + 12) % 24;
    const eveningTime = `${String(eveningH).padStart(2, '0')}:${u.preferredTime.split(':')[1]}`;
    return eveningTime === timeStr;
  });
}

// ═══════════════════════════════════════════════════════════════════
// WAITLIST
// ═══════════════════════════════════════════════════════════════════

function loadWaitlist() {
  try {
    return JSON.parse(fs.readFileSync(WAITLIST_FILE, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * Compute Aura++ status from the two subscription flags. Aura++ is a STATUS,
 * not a SKU (DECISIONS.md, Night-2 #3): a user holds it when both pillars are
 * active. Never stored — always derived so the flags stay the single truth.
 * @param {object} user
 * @returns {{ oratorActive: boolean, lookmaxxingActive: boolean, auraPlusPlus: boolean }}
 */
function computeAuraStatus(user) {
  const oratorActive = !!(user && user.oratorActive);
  const lookmaxxingActive = !!(user && user.lookmaxxingActive);
  return { oratorActive, lookmaxxingActive, auraPlusPlus: oratorActive && lookmaxxingActive };
}

function addToWaitlist(phone, pillar) {
  const list = loadWaitlist();
  phone = phone.replace(/[\s+\-]/g, '');
  if (phone.length === 10) phone = '91' + phone;

  // Don't duplicate
  if (list.find(e => e.phone === phone && e.pillar === pillar)) return false;

  list.push({ phone, pillar, timestamp: new Date().toISOString() });
  fs.writeFileSync(WAITLIST_FILE, JSON.stringify(list, null, 2));
  return true;
}

function getWaitlist() {
  return loadWaitlist();
}

module.exports = {
  createUser,
  getUserByPhone,
  getUserByToken,
  getUserBySubscriptionId,
  updateUser,
  addScore,
  addChronicle,
  addWordsLearned,
  masterWord,
  computeAuraStatus,
  getAllUsers,
  getUsersForTime,
  getUsersForEveningTime,
  addToWaitlist,
  getWaitlist,
};
