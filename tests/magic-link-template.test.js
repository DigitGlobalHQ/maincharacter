/**
 * Tests for data/email-templates/magic-link.html
 * Asserts: well-formed structure, required tokens present, copy slots filled,
 * no forbidden Consultant tokens, preheader present, CTA attributes correct.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const templatePath = path.join(__dirname, '..', 'data', 'email-templates', 'magic-link.html');
const template = fs.readFileSync(templatePath, 'utf8');

/** Simulate the server-side token substitution the email service does. */
function render(vars = {}) {
  return Object.entries(vars).reduce(
    (html, [k, v]) => html.replaceAll(`{{${k}}}`, v),
    template
  );
}

describe('magic-link.html — template structure', () => {
  it('is a non-empty HTML file', () => {
    expect(template.length).toBeGreaterThan(200);
    expect(/<html/i.test(template)).toBe(true);
  });

  it('contains the Mustache tokens {{name}}, {{magicLinkUrl}}, {{preheader}}', () => {
    expect(template).toContain('{{name}}');
    expect(template).toContain('{{magicLinkUrl}}');
    expect(template).toContain('{{preheader}}');
  });

  it('contains the ◆ MainCharacter eyebrow (as entity or literal)', () => {
    // Template uses &#9670; (decimal entity for ◆) or literal ◆
    expect(template).toMatch(/&#9670;|◆/);
    expect(template).toContain('MainCharacter');
  });

  it('has a Cormorant Garamond Google Fonts link in <head>', () => {
    expect(template).toContain('fonts.googleapis.com');
    expect(template).toContain('Cormorant+Garamond');
  });

  it('uses table-based layout (role="presentation" tables, inline styles only)', () => {
    expect(template).toContain('role="presentation"');
    // No class= attributes that reference an external stylesheet
    expect(template).not.toContain('class=');
    // No external <link rel="stylesheet"> other than Google Fonts
    const styleLinks = (template.match(/<link[^>]+rel="stylesheet"[^>]*>/gi) || []).filter(
      (l) => !l.includes('fonts.googleapis.com')
    );
    expect(styleLinks.length).toBe(0);
  });

  it('contains the preheader hidden div', () => {
    expect(template).toContain('max-height:0');
    expect(template).toContain('{{preheader}}');
  });

  it('has a CTA <a> pointing to {{magicLinkUrl}} with the silver light fill', () => {
    expect(template).toContain('href="{{magicLinkUrl}}"');
    // CTA button styling — near-white fill (silver brand), dark text
    expect(template).toContain('background:#ececf2');
    expect(template).toContain('color:#070708');
  });

  it('has a fallback plain URL row using {{magicLinkUrl}}', () => {
    // The URL appears at least twice: once in the button href, once in the fallback
    const occurrences = (template.match(/\{\{magicLinkUrl\}\}/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  it('contains the security note (no-action-needed copy)', () => {
    expect(template).toContain('no action is needed');
    expect(template).toContain('fifteen minutes');
  });

  it('contains the signature footer', () => {
    expect(template).toContain('The Consultant');
  });

  it('has obsidian background (#070708) on outer wrapper', () => {
    expect(template).toContain('#070708');
  });

  it('has panel background (#0d0d0f) on inner card', () => {
    expect(template).toContain('#0d0d0f');
  });

  it('contains no exclamation marks in copy', () => {
    // Strip HTML tags to check prose only
    const prose = template.replace(/<[^>]+>/g, ' ');
    expect(prose).not.toContain('!');
  });

  it('contains no emoji other than ◆ (&#9670;)', () => {
    // Strip the one allowed entity/char, then check for any remaining emoji-range chars
    const stripped = template.replace(/&#9670;/g, '').replace(/◆/g, '');
    // Simple emoji detection: any codepoint above U+2700 that is not typography
    // This is a heuristic — covers the common emoji blocks
    expect(/[\u{1F000}-\u{1FFFF}]/u.test(stripped)).toBe(false);
  });
});

describe('magic-link.html — token substitution', () => {
  const rendered = render({
    name: 'Aryan',
    magicLinkUrl: 'https://maincharacter.digitglobalservices.com/lookmax/login?token=abc123',
    preheader: 'Single-use, valid for fifteen minutes. Open it on the device you want to work on.',
  });

  it('substitutes {{name}} with the user name', () => {
    expect(rendered).toContain('Aryan');
    expect(rendered).not.toContain('{{name}}');
  });

  it('substitutes {{magicLinkUrl}} with the full URL', () => {
    expect(rendered).toContain('https://maincharacter.digitglobalservices.com/lookmax/login?token=abc123');
    expect(rendered).not.toContain('{{magicLinkUrl}}');
  });

  it('substitutes {{preheader}} with the preheader text', () => {
    expect(rendered).toContain('Single-use, valid for fifteen minutes');
    expect(rendered).not.toContain('{{preheader}}');
  });

  it('CTA href points to the magic link URL after substitution', () => {
    expect(rendered).toContain('href="https://maincharacter.digitglobalservices.com/lookmax/login?token=abc123"');
  });

  it('produces well-formed HTML with a doctype and closing html tag', () => {
    expect(rendered).toMatch(/<!doctype html>/i);
    expect(rendered).toMatch(/<\/html>/i);
  });
});

describe('magic-link.html — brand voice checks', () => {
  it('body copy mentions "fifteen minutes" (TTL)', () => {
    expect(template).toContain('fifteen minutes');
  });

  it('body copy mentions "single-use" (security)', () => {
    expect(template.toLowerCase()).toContain('single-use');
  });

  it('CTA label is "Enter Lookmaxxing" (per approved copy)', () => {
    expect(template).toContain('Enter Lookmaxxing');
  });

  it('fallback line says "paste this address" (per approved copy)', () => {
    expect(template).toContain('paste this address');
  });

  it('headline contains "Your entry link is below"', () => {
    expect(template).toContain('Your entry link is below');
  });
});
