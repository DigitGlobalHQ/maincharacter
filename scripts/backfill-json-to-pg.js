#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════
 * scripts/backfill-json-to-pg.js — one-shot JSON → Postgres migration
 * ═══════════════════════════════════════════════════════════════════
 *
 * FOUNDER ACTION — run this ONCE after the first deploy with DATABASE_URL set:
 *
 *   node scripts/backfill-json-to-pg.js
 *
 * What it does:
 *   1. Connects to Postgres (reads DATABASE_URL from env / .env).
 *   2. Runs the migration runner so the schema is up to date.
 *   3. Reads data/users.json      → inserts into `users` table.
 *   4. Reads data/audit-sessions.json → inserts into `audit_sessions` table.
 *   5. Reads data/early-access.json   → inserts into `early_access` table.
 *   6. Reads data/waitlist.json  (legacy format) — skipped (no pg table for it).
 *
 * All inserts use ON CONFLICT DO NOTHING so re-running is safe (idempotent).
 * The script does NOT delete the JSON files — they remain as the fallback.
 *
 * Expected output (first run with data):
 *   ✓ Users backfilled:        N
 *   ✓ AuditSessions backfilled: N
 *   ✓ EarlyAccess backfilled:   N
 *
 * Expected output (clean re-run):
 *   ✓ Users backfilled:        0  (all already present)
 *   ...
 *
 * ═══════════════════════════════════════════════════════════════════
 */

'use strict';

require('dotenv').config();

const fs   = require('fs');
const path = require('path');

// ── helper ──────────────────────────────────────────────────────────────────

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`  (skipped — ${path.basename(filePath)} not found)`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`  ERROR reading ${filePath}: ${err.message}`);
    return null;
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is not set. Set it in your .env or Render dashboard.');
    process.exit(1);
  }

  console.log('');
  console.log('═'.repeat(60));
  console.log('  MainCharacter — JSON → Postgres backfill');
  console.log('═'.repeat(60));

  // Init pool + run migrations
  const db      = require('../lib/db');
  const migrate = require('../lib/migrate');

  const ready = await db.init();
  if (!ready) {
    console.error('ERROR: Could not connect to Postgres. Check DATABASE_URL.');
    process.exit(1);
  }
  console.log('  Postgres: connected');

  const migCount = await migrate.run();
  console.log(`  Migrations applied: ${migCount}`);
  console.log('');

  // ── 1. Users ─────────────────────────────────────────────────────────────

  const usersPath = process.env.USERS_FILE_PATH || path.join(__dirname, '..', 'data', 'users.json');
  const usersRaw  = loadJson(usersPath);
  let userCount = 0;

  if (usersRaw && typeof usersRaw === 'object') {
    const userArr = Object.values(usersRaw);
    console.log(`  Users found in JSON: ${userArr.length}`);
    for (const u of userArr) {
      try {
        const { rowCount } = await db.query(
          `INSERT INTO users (
             token, name, phone, email, pillar, preferred_time,
             enrolled_at, day, status, trial_complete, awaiting_response,
             last_morning_sent, last_evening_sent, scores, words_learned,
             chronicle, rank, streak, last_active, subscription_status,
             razorpay_customer_id, razorpay_subscription_id, notes,
             orator_active, lookmaxxing_active, mirror_level,
             audit_session_id, lookmaxxing_started_at, orator_started_at,
             push_subscription, lookmax_baseline,
             lookmax_streak, lookmax_protocol_streak, last_mirror_at,
             magic_link_token, magic_link_expires_at, magic_link_consumed_at,
             first_login_token, first_login_expires_at, first_login_consumed_at,
             created_at, updated_at
           ) VALUES (
             $1,$2,$3,$4,$5,$6,
             $7,$8,$9,$10,$11,
             $12,$13,$14,$15,
             $16,$17,$18,$19,$20,
             $21,$22,$23,
             $24,$25,$26,
             $27,$28,$29,
             $30,$31,
             $32,$33,$34,
             $35,$36,$37,
             $38,$39,$40,
             NOW(),NOW()
           )
           ON CONFLICT (token) DO NOTHING`,
          [
            u.token, u.name, u.phone, u.email || null, u.pillar || 'orator', u.preferredTime || '08:00',
            u.enrolledAt || new Date().toISOString(), u.day || 0, u.status || 'active',
            !!u.trialComplete, !!u.awaitingResponse,
            u.lastMorningSent || null, u.lastEveningSent || null,
            JSON.stringify(u.scores || []),
            JSON.stringify(u.wordsLearned || []),
            JSON.stringify(u.chronicle || []),
            u.rank || 'unawakened', u.streak || 0,
            u.lastActive || new Date().toISOString(),
            u.subscriptionStatus || 'trial',
            u.razorpayCustomerId || null, u.razorpaySubscriptionId || null, u.notes || '',
            !!u.oratorActive, !!u.lookmaxxingActive,
            u.mirrorLevel || 'raw',
            u.auditSessionId || null,
            u.lookmaxxingStartedAt || null, u.oratorStartedAt || null,
            u.pushSubscription ? JSON.stringify(u.pushSubscription) : null,
            u.lookmaxBaseline ? JSON.stringify(u.lookmaxBaseline) : null,
            u.lookmaxStreak || 0, u.lookmaxProtocolStreak || 0, u.lastMirrorAt || null,
            u.magicLinkToken || null, u.magicLinkExpiresAt || null, u.magicLinkConsumedAt || null,
            u.firstLoginToken || null, u.firstLoginExpiresAt || null, u.firstLoginConsumedAt || null,
          ]
        );
        userCount += rowCount || 0;
      } catch (err) {
        console.error(`  ERROR inserting user ${u.phone}: ${err.message}`);
      }
    }
  }
  console.log(`  ✓ Users backfilled: ${userCount}`);

  // ── 2. AuditSessions ─────────────────────────────────────────────────────

  const sessionsPath = process.env.AUDIT_SESSIONS_FILE_PATH || path.join(__dirname, '..', 'data', 'audit-sessions.json');
  const sessionsRaw  = loadJson(sessionsPath);
  let sessionCount = 0;

  if (sessionsRaw && typeof sessionsRaw === 'object') {
    const sessionArr = Object.values(sessionsRaw);
    console.log(`  AuditSessions found in JSON: ${sessionArr.length}`);
    for (const s of sessionArr) {
      try {
        const { rowCount } = await db.query(
          `INSERT INTO audit_sessions (
             session_token, intent, re_audit, user_token,
             quiz_answers, photos, aesthetic_scores, weakest_axis,
             hair_receding, diagnosis, created_at, completed_at, expires_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (session_token) DO NOTHING`,
          [
            s.sessionToken, s.intent || null, !!s.reAudit, s.userToken || null,
            s.quizAnswers ? JSON.stringify(s.quizAnswers) : null,
            JSON.stringify(s.photos || []),
            s.aestheticScores ? JSON.stringify(s.aestheticScores) : null,
            s.weakestAxis || null,
            s.hairReceding ? JSON.stringify(s.hairReceding) : null,
            s.diagnosis || null,
            s.createdAt || new Date().toISOString(),
            s.completedAt || null,
            // expires 24h after creation
            new Date(new Date(s.createdAt || Date.now()).getTime() + 24 * 60 * 60 * 1000).toISOString(),
          ]
        );
        sessionCount += rowCount || 0;
      } catch (err) {
        console.error(`  ERROR inserting session ${s.sessionToken}: ${err.message}`);
      }
    }
  }
  console.log(`  ✓ AuditSessions backfilled: ${sessionCount}`);

  // ── 3. EarlyAccess ───────────────────────────────────────────────────────

  const eaPath = process.env.EARLY_ACCESS_FILE_PATH || path.join(__dirname, '..', 'data', 'early-access.json');
  const eaRaw  = loadJson(eaPath);
  let eaCount = 0;

  if (Array.isArray(eaRaw)) {
    console.log(`  EarlyAccess found in JSON: ${eaRaw.length}`);
    for (const e of eaRaw) {
      try {
        const { rowCount } = await db.query(
          `INSERT INTO early_access (id, phone, name, source_audit_session_token, created_at)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (phone) DO NOTHING`,
          [e.id, e.phone, e.name || '', e.sourceAuditSessionToken || null, e.createdAt || new Date().toISOString()]
        );
        eaCount += rowCount || 0;
      } catch (err) {
        console.error(`  ERROR inserting early-access ${e.phone}: ${err.message}`);
      }
    }
  }
  console.log(`  ✓ EarlyAccess backfilled: ${eaCount}`);

  console.log('');
  console.log('  Backfill complete. JSON files are NOT deleted — they remain as fallback.');
  console.log('  Set MC_DB_BACKEND=pg (or ensure DATABASE_URL is set) to activate the pg path.');
  console.log('═'.repeat(60));
  console.log('');

  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
