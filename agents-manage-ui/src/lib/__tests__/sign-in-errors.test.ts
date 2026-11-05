import { describe, expect, it } from 'vitest';
import { ACCOUNT_NOT_LINKED_MESSAGE, getSignInErrorMessage } from '../sign-in-errors';

describe('getSignInErrorMessage', () => {
  it('explains the SSO callback spelling of account not linked', () => {
    expect(getSignInErrorMessage('account not linked', null)).toBe(ACCOUNT_NOT_LINKED_MESSAGE);
  });

  it('explains the social callback spelling of account not linked', () => {
    expect(getSignInErrorMessage('account_not_linked', null)).toBe(ACCOUNT_NOT_LINKED_MESSAGE);
  });

  it('prefers the error description for other errors', () => {
    expect(getSignInErrorMessage('invalid_provider', 'token_not_verified')).toBe(
      'token not verified'
    );
  });

  it('falls back to the error code for other errors', () => {
    expect(getSignInErrorMessage('access_denied', null)).toBe('access denied');
  });

  it('returns null when there is no error', () => {
    expect(getSignInErrorMessage(null, 'ignored')).toBeNull();
  });
});
