/**
 * tests/lookmaxing-events.test.js
 * Verifies every Stage-1 Audit Engine KPI event name is in the allowlist.
 * Source: briefs/stage-1-audit-spec.md §8 "Frontend instrumentation events".
 */

import { describe, it, expect } from 'vitest';
import { ALLOWED_EVENTS } from '../services/events';

// All 17 (+ orator_waitlist_joined) new event names from spec §8.
const STAGE_1_AUDIT_EVENTS = [
  'lookmaxing_landing_viewed',
  'lookmaxing_video_played',
  'lookmaxing_video_watched_50',
  'lookmaxing_video_watched_90',
  'lookmaxing_cta_clicked',
  'lookmaxing_fork_guest',
  'lookmaxing_fork_signin',
  'lookmaxing_quiz_started',
  'lookmaxing_quiz_completed',
  'lookmaxing_photo_uploaded',
  'lookmaxing_audit_generated',
  'lookmaxing_audit_viewed',
  'lookmaxing_paywall_viewed',
  'lookmaxing_paywall_blurred_metric_tapped',
  'lookmaxing_pay_initiated',
  'lookmaxing_pay_succeeded',
  'lookmaxing_pay_failed',
  'lookmaxing_merge_completed',
  'lookmaxing_pdf_downloaded',
  'lookmaxing_fork_trial',
  'lookmaxing_fork_premium',
  'orator_waitlist_joined',
];

describe('Stage-1 Audit Engine KPI events allowlist', () => {
  for (const name of STAGE_1_AUDIT_EVENTS) {
    it(`ALLOWED_EVENTS contains ${name}`, () => {
      expect(ALLOWED_EVENTS.has(name)).toBe(true);
    });
  }

  it('total allowlist size has grown (was 34 before stage-1-audit)', () => {
    // This fires if someone accidentally shrinks the allowlist.
    expect(ALLOWED_EVENTS.size).toBeGreaterThanOrEqual(34 + STAGE_1_AUDIT_EVENTS.length);
  });
});
