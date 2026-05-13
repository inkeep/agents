import { describe, expect, it } from 'vitest';
import { getCaptchaErrorMessage } from '../captcha-errors';

describe('getCaptchaErrorMessage', () => {
  it('returns a user-friendly message for MISSING_RESPONSE', () => {
    expect(getCaptchaErrorMessage('MISSING_RESPONSE')).toMatch(/security verification failed/i);
  });

  it('returns a user-friendly message for VERIFICATION_FAILED', () => {
    expect(getCaptchaErrorMessage('VERIFICATION_FAILED')).toMatch(/security verification failed/i);
  });

  it('returns a user-friendly message for UNKNOWN_ERROR', () => {
    expect(getCaptchaErrorMessage('UNKNOWN_ERROR')).toMatch(/security verification failed/i);
  });

  it('returns null for non-captcha error codes', () => {
    expect(getCaptchaErrorMessage('INVALID_CREDENTIALS')).toBeNull();
    expect(getCaptchaErrorMessage('PASSWORD_COMPROMISED')).toBeNull();
    expect(getCaptchaErrorMessage('SOMETHING_ELSE')).toBeNull();
  });

  it('returns null for empty, null, or undefined codes', () => {
    expect(getCaptchaErrorMessage(undefined)).toBeNull();
    expect(getCaptchaErrorMessage(null)).toBeNull();
    expect(getCaptchaErrorMessage('')).toBeNull();
  });
});
