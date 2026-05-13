// Mirrors better-auth's captcha plugin EXTERNAL_ERROR_CODES
// (better-auth/plugins/captcha/error-codes). Re-verify on better-auth upgrades —
// these codes are not exported by the package's public entry, so additions
// upstream silently slip through unless audited here.
const CAPTCHA_ERROR_CODES = new Set(['MISSING_RESPONSE', 'VERIFICATION_FAILED', 'UNKNOWN_ERROR']);

export const CAPTCHA_ERROR_MESSAGE =
  'Security verification failed. Please refresh the page and try again.';

export function getCaptchaErrorMessage(code: string | null | undefined): string | null {
  if (typeof code === 'string' && CAPTCHA_ERROR_CODES.has(code)) {
    return CAPTCHA_ERROR_MESSAGE;
  }
  return null;
}
