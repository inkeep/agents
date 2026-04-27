import { describe, expect, it } from 'vitest';
import {
  enforcePasswordPolicy,
  generateCompliantPassword,
  MIN_PASSWORD_LENGTH,
  validatePasswordPolicy,
} from '../password-policy';

describe('validatePasswordPolicy', () => {
  it('accepts a strong password', () => {
    const violations = validatePasswordPolicy('MyStr0ng!PassTest');
    expect(violations).toHaveLength(0);
  });

  it('rejects passwords shorter than 15 characters', () => {
    const violations = validatePasswordPolicy('Sh0rt!pw');
    expect(violations.some((v) => v.rule === 'minLength')).toBe(true);
  });

  it('requires at least one lowercase letter', () => {
    const violations = validatePasswordPolicy('ALLUPPERCASE1234!');
    expect(violations.some((v) => v.rule === 'lowercase')).toBe(true);
  });

  it('requires at least one uppercase letter', () => {
    const violations = validatePasswordPolicy('alllowercase1234!');
    expect(violations.some((v) => v.rule === 'uppercase')).toBe(true);
  });

  it('requires at least one digit', () => {
    const violations = validatePasswordPolicy('NoDigitsHereAtAll!!');
    expect(violations.some((v) => v.rule === 'digit')).toBe(true);
  });

  it('requires at least one special character', () => {
    const violations = validatePasswordPolicy('NoSpecialCharsAtAll1');
    expect(violations.some((v) => v.rule === 'special')).toBe(true);
  });

  it('rejects passwords containing the user email local part', () => {
    const violations = validatePasswordPolicy('omar12345!ABCDE', { userEmail: 'omar@example.com' });
    expect(violations.some((v) => v.rule === 'email')).toBe(true);
  });

  it('rejects passwords containing the user name', () => {
    const violations = validatePasswordPolicy('johnSmithABCD1!', { userName: 'johnsmith' });
    expect(violations.some((v) => v.rule === 'name')).toBe(true);
  });

  it('rejects passwords containing the company name', () => {
    const violations = validatePasswordPolicy('myInkeepABCDE1!');
    expect(violations.some((v) => v.rule === 'company')).toBe(true);
  });

  it('ignores email check when local part is too short', () => {
    const violations = validatePasswordPolicy('MyStr0ng!PassTest', { userEmail: 'ab@example.com' });
    expect(violations.some((v) => v.rule === 'email')).toBe(false);
  });

  it('ignores name check when name is too short', () => {
    const violations = validatePasswordPolicy('MyStr0ng!PassTest', { userName: 'ab' });
    expect(violations.some((v) => v.rule === 'name')).toBe(false);
  });

  it('returns multiple violations at once', () => {
    const violations = validatePasswordPolicy('short');
    expect(violations.length).toBeGreaterThan(1);
    const rules = violations.map((v) => v.rule);
    expect(rules).toContain('minLength');
    expect(rules).toContain('uppercase');
    expect(rules).toContain('digit');
    expect(rules).toContain('special');
  });

  it('accepts long passphrases that meet all requirements', () => {
    const violations = validatePasswordPolicy(
      'This is a very long passphrase with Numbers1 and Special! characters'
    );
    expect(violations).toHaveLength(0);
  });
});

describe('enforcePasswordPolicy', () => {
  it('joins all violations into a single message when more than one rule fails', () => {
    expect(() => enforcePasswordPolicy('short')).toThrow(
      /At least 15 characters.*One uppercase letter.*One number.*One special character/
    );
  });

  it('does not throw for compliant passwords', () => {
    expect(() => enforcePasswordPolicy('MyStr0ng!PassTest')).not.toThrow();
  });
});

describe('generateCompliantPassword', () => {
  it('produces policy-compliant output across many iterations', () => {
    for (let i = 0; i < 100; i++) {
      const pw = generateCompliantPassword();
      expect(pw.length).toBe(MIN_PASSWORD_LENGTH + 4);
      expect(validatePasswordPolicy(pw)).toHaveLength(0);
    }
  });

  it('respects a custom length argument', () => {
    const pw = generateCompliantPassword(32);
    expect(pw.length).toBe(32);
    expect(validatePasswordPolicy(pw)).toHaveLength(0);
  });

  it('throws when requested length is below the policy minimum', () => {
    expect(() => generateCompliantPassword(MIN_PASSWORD_LENGTH - 1)).toThrow();
  });

  it('produces varied output (no fixed suffix)', () => {
    const samples = new Set<string>();
    for (let i = 0; i < 20; i++) samples.add(generateCompliantPassword());
    expect(samples.size).toBe(20);
  });
});
