/**
 * Tests for paywall.html login-gate modification:
 *  - Email field has data-required="lookmax" attribute
 *  - begin() function includes the Lookmaxxing email-required validation
 *  - Validation error copy matches approved spec-login-gate-copy.md string
 *  - The locked card copy (Orator, Lookmaxxing, Aura++) is unchanged
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'paywall.html'), 'utf8');

describe('paywall.html — email-required modification (Login Gate)', () => {
  it('email input has data-required="lookmax" marker', () => {
    expect(html).toContain('data-required="lookmax"');
  });

  it('begin() checks requireEmail = pillars.includes(lookmaxxing)', () => {
    expect(html).toContain('pillars.includes(\'lookmaxxing\')');
    expect(html).toContain('requireEmail');
  });

  it('shows the approved error copy when email is blank and Lookmaxxing is selected', () => {
    // The approved copy from spec-login-gate-copy.md paywall.email.required
    expect(html).toContain('Email is required for Lookmaxxing. You enter the work through it.');
  });

  it('calls updateEmailRequirement(pillars) inside begin()', () => {
    expect(html).toContain('updateEmailRequirement(pillars)');
  });

  it('updateEmailRequirement sets aria-required on the email input for Lookmaxxing', () => {
    expect(html).toContain("aria-required', 'true'");
  });

  it('updateEmailRequirement hides the "(optional)" span for Lookmaxxing', () => {
    expect(html).toContain("emailOptional.style.display = 'none'");
  });

  it('the email label has an id="emailLabel" for programmatic access', () => {
    expect(html).toContain('id="emailLabel"');
  });

  it('the emailOptional span has id="emailOptional"', () => {
    expect(html).toContain('id="emailOptional"');
  });

  it('still calls /api/payment/subscribe for all three card options', () => {
    expect(html).toContain("begin(['orator'])");
    expect(html).toContain("begin(['lookmaxxing'])");
    expect(html).toContain("begin(['orator','lookmaxxing'])");
  });

  it('locked card copy is unchanged — Orator bullets intact', () => {
    expect(html).toContain('Daily WhatsApp Protocol');
    expect(html).toContain('Weekly Evolution Reports');
    expect(html).toContain('Voice or text both work');
  });

  it('locked card copy is unchanged — Lookmaxxing bullets intact', () => {
    expect(html).toContain('Daily Mirror Score');
    expect(html).toContain('Hair Receding Tracker');
    expect(html).toContain('Day-30 Re-Audit');
  });

  it('locked card copy is unchanged — Aura++ bullets intact', () => {
    expect(html).toContain('Aura++');
    expect(html).toContain('₹1,999');
    expect(html).toContain('Saves ₹299/mo');
  });

  it('no exclamation marks in paywall copy (brand voice)', () => {
    const visible = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/◆/g, '');
    expect(visible).not.toMatch(/!/);
  });
});

describe('paywall.html — email validation regex (Orator-only path unchanged)', () => {
  it('still validates email format when provided', () => {
    // The existing regex test for email format is still in place
    expect(html).toContain('/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/');
  });

  it('email remains optional when only Orator is selected (no requireEmail guard)', () => {
    // The requireEmail guard only fires when pillars.includes('lookmaxxing')
    // Verify the guard is conditional — not a blanket required.
    // Search all script content (paywall.html may have multiple <script> tags
    // including an external <script src="..."> added by F2 consolidation).
    const allScriptContent = (html.match(/<script[\s\S]*?<\/script>/gi) || []).join('\n');
    expect(allScriptContent).toContain('requireEmail && !email');
  });
});
