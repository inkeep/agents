export const ACCOUNT_NOT_LINKED_MESSAGE =
  'This email already has an account that uses a different sign-in method. Sign in with the method you used before.';

export function getSignInErrorMessage(
  error: string | null | undefined,
  description: string | null | undefined
): string | null {
  if (!error) return null;
  if (error.replace(/ /g, '_') === 'account_not_linked') return ACCOUNT_NOT_LINKED_MESSAGE;
  return `${description || error}`.replace(/_/g, ' ');
}
