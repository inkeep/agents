import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { createAuth } from '../auth';
import { waitForPasswordResetLink } from '../password-reset-link-store';

const USER_EMAIL = 'session-owner@example.com';
const ORIGINAL_PASSWORD = 'OldSecretThatIsLongEnoughZ!1';
const REPLACEMENT_PASSWORD = 'NewSecretThatIsLongEnoughZ!1';

describe('password reset session revocation', () => {
  it('revokes all existing sessions for the reset user while preserving another user session', async () => {
    const auth = createAuth({
      baseURL: 'http://localhost:3002',
      secret: 'synthetic-secret-for-password-reset-session-revocation',
      dbClient: testRunDbClient,
      disablePasswordCompromiseCheck: true,
    });
    const firstSignIn = await auth.api.signUpEmail({
      body: { email: USER_EMAIL, password: ORIGINAL_PASSWORD, name: 'Session Owner' },
    });
    const secondSignIn = await auth.api.signInEmail({
      body: { email: USER_EMAIL, password: ORIGINAL_PASSWORD },
    });
    const unrelatedSignIn = await auth.api.signUpEmail({
      body: {
        email: 'other-session-owner@example.com',
        password: 'OtherSecretThatIsLongEnoughZ!1',
        name: 'Other Session Owner',
      },
    });

    const readSessionWithoutCookieCache = (token: string | null) =>
      auth.api.getSession({
        headers: new Headers({ authorization: `Bearer ${token}` }),
        query: { disableCookieCache: true },
      });

    expect(firstSignIn.token).toEqual(expect.any(String));
    expect(secondSignIn.token).toEqual(expect.any(String));
    expect(secondSignIn.token).not.toBe(firstSignIn.token);
    for (const token of [firstSignIn.token, secondSignIn.token]) {
      expect(await readSessionWithoutCookieCache(token)).toMatchObject({
        user: { id: firstSignIn.user.id },
      });
    }
    expect(await readSessionWithoutCookieCache(unrelatedSignIn.token)).toMatchObject({
      user: { id: unrelatedSignIn.user.id },
    });

    const resetLinkPromise = waitForPasswordResetLink(USER_EMAIL);
    const [resetRequest, resetLink] = await Promise.all([
      auth.api.requestPasswordReset({ body: { email: USER_EMAIL } }),
      resetLinkPromise,
    ]);
    expect(resetRequest.status).toBe(true);

    const reset = await auth.api.resetPassword({
      body: { token: resetLink.token, newPassword: REPLACEMENT_PASSWORD },
    });
    expect(reset.status).toBe(true);

    for (const token of [firstSignIn.token, secondSignIn.token]) {
      expect(await readSessionWithoutCookieCache(token)).toBeNull();
    }
    expect(await readSessionWithoutCookieCache(unrelatedSignIn.token)).toMatchObject({
      user: { id: unrelatedSignIn.user.id },
    });

    const rejectedSignIn = await auth.api.signInEmail({
      body: { email: USER_EMAIL, password: ORIGINAL_PASSWORD },
      asResponse: true,
    });
    expect(rejectedSignIn.status).toBe(401);

    const replacementSignIn = await auth.api.signInEmail({
      body: { email: USER_EMAIL, password: REPLACEMENT_PASSWORD },
      asResponse: true,
    });
    expect(replacementSignIn.status).toBe(200);
  });
});
