import { describe, it, expect } from 'vitest';

const { maskEmail, maskPhone, maskToken } = require('../lib/log-mask');

describe('maskEmail', () => {
  it('masks a standard email: keeps first char + domain', () => {
    expect(maskEmail('john@gmail.com')).toBe('j***@gmail.com');
  });

  it('works for a single-char local part', () => {
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });

  it('works for a long local part', () => {
    expect(maskEmail('consultant@maincharacter.digitglobalservices.com')).toBe(
      'c***@maincharacter.digitglobalservices.com'
    );
  });

  it('returns [no-email] for null', () => {
    expect(maskEmail(null)).toBe('[no-email]');
  });

  it('returns [no-email] for undefined', () => {
    expect(maskEmail(undefined)).toBe('[no-email]');
  });

  it('returns [no-email] for empty string', () => {
    expect(maskEmail('')).toBe('[no-email]');
  });

  it('returns [invalid-email] for a string without @', () => {
    expect(maskEmail('notanemail')).toBe('[invalid-email]');
  });

  it('returns [invalid-email] for @ at position 0', () => {
    expect(maskEmail('@domain.com')).toBe('[invalid-email]');
  });

  it('handles numeric local part', () => {
    expect(maskEmail('123@example.com')).toBe('1***@example.com');
  });
});

describe('maskPhone', () => {
  it('shows only the last 4 digits of a 12-digit Indian number', () => {
    expect(maskPhone('919876543210')).toBe('********3210');
  });

  it('shows only the last 4 digits of a 10-digit number', () => {
    expect(maskPhone('9876543210')).toBe('******3210');
  });

  it('returns [no-phone] for null', () => {
    expect(maskPhone(null)).toBe('[no-phone]');
  });

  it('returns [no-phone] for undefined', () => {
    expect(maskPhone(undefined)).toBe('[no-phone]');
  });

  it('returns [no-phone] for empty string', () => {
    expect(maskPhone('')).toBe('[no-phone]');
  });

  it('returns **** for a phone with fewer than 4 digits', () => {
    expect(maskPhone('123')).toBe('****');
  });

  it('strips non-digit chars before masking', () => {
    // +91-9876-543210 → 919876543210 → ********3210
    expect(maskPhone('+91-9876-543210')).toBe('********3210');
  });
});

describe('maskToken', () => {
  it('always returns [redacted] regardless of input', () => {
    expect(maskToken('abc123deadbeef')).toBe('[redacted]');
    expect(maskToken(null)).toBe('[redacted]');
    expect(maskToken(undefined)).toBe('[redacted]');
    expect(maskToken('')).toBe('[redacted]');
    expect(maskToken('x'.repeat(64))).toBe('[redacted]');
  });
});
