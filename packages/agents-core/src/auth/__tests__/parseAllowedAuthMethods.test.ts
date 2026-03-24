import { describe, expect, it } from 'vitest';
import { parseAllowedAuthMethods, serializeAllowedAuthMethods } from '../auth-types';

const DEFAULT_METHODS = [{ method: 'email-password' }];

describe('parseAllowedAuthMethods', () => {
  it('should return default methods for null input', () => {
    expect(parseAllowedAuthMethods(null)).toEqual(DEFAULT_METHODS);
  });

  it('should return default methods for undefined input', () => {
    expect(parseAllowedAuthMethods(undefined)).toEqual(DEFAULT_METHODS);
  });

  it('should return default methods for empty string', () => {
    expect(parseAllowedAuthMethods('')).toEqual(DEFAULT_METHODS);
  });

  it('should return default methods for invalid JSON', () => {
    expect(parseAllowedAuthMethods('{bad json')).toEqual(DEFAULT_METHODS);
  });

  it('should return default methods when JSON is not an array', () => {
    expect(parseAllowedAuthMethods('{"method":"email-password"}')).toEqual(DEFAULT_METHODS);
  });

  it('should return default methods for an empty array', () => {
    expect(parseAllowedAuthMethods('[]')).toEqual(DEFAULT_METHODS);
  });

  it('should parse a valid email-password method', () => {
    const input = JSON.stringify([{ method: 'email-password' }]);
    expect(parseAllowedAuthMethods(input)).toEqual([{ method: 'email-password' }]);
  });

  it('should parse a valid google method', () => {
    const input = JSON.stringify([{ method: 'google' }]);
    expect(parseAllowedAuthMethods(input)).toEqual([{ method: 'google' }]);
  });

  it('should parse a valid SSO method with all required fields', () => {
    const ssoMethod = {
      method: 'sso',
      providerId: 'provider-1',
      displayName: 'My SSO',
      autoProvision: true,
      enabled: true,
    };
    const input = JSON.stringify([ssoMethod]);
    expect(parseAllowedAuthMethods(input)).toEqual([ssoMethod]);
  });

  it('should parse multiple valid methods together', () => {
    const methods = [
      { method: 'email-password' },
      { method: 'google' },
      {
        method: 'sso',
        providerId: 'okta',
        displayName: 'Okta SSO',
        autoProvision: false,
        enabled: true,
      },
    ];
    const input = JSON.stringify(methods);
    expect(parseAllowedAuthMethods(input)).toEqual(methods);
  });

  it('should filter out invalid items and keep valid ones', () => {
    const input = JSON.stringify([
      { method: 'email-password' },
      { method: 'invalid-method' },
      { method: 'google' },
    ]);
    expect(parseAllowedAuthMethods(input)).toEqual([
      { method: 'email-password' },
      { method: 'google' },
    ]);
  });

  it('should return default when all items are invalid', () => {
    const input = JSON.stringify([{ method: 'invalid' }, { method: 'also-invalid' }]);
    expect(parseAllowedAuthMethods(input)).toEqual(DEFAULT_METHODS);
  });

  it('should reject SSO method missing required fields', () => {
    const input = JSON.stringify([{ method: 'sso', providerId: 'provider-1' }]);
    expect(parseAllowedAuthMethods(input)).toEqual(DEFAULT_METHODS);
  });

  it('should roundtrip through serialize and parse', () => {
    const methods = [
      { method: 'email-password' as const },
      {
        method: 'sso' as const,
        providerId: 'provider-1',
        displayName: 'Corp SSO',
        autoProvision: true,
        enabled: true,
      },
    ];
    const serialized = serializeAllowedAuthMethods(methods);
    expect(parseAllowedAuthMethods(serialized)).toEqual(methods);
  });
});
