/**
 * Verifies the `INKEEP_AUTH_INIT_FORCE_PASSWORD_RESET` branch in init.ts
 * end-to-end against the test pglite database: when the flag is set and
 * the admin user already exists, the credential-account password is
 * re-hashed and stored. Sign-in with the new password succeeds; sign-in
 * with the old password fails — proving the on-disk hash actually rotated.
 *
 * `init.ts` is a top-level script (loadEnvironmentFiles + auto-execute on
 * import), so we replicate just the resync branch verbatim against the
 * same Better Auth instance the real script uses.
 */

import { hashPassword } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { createAuth } from '../auth';

const BETTER_AUTH_SECRET = 'test-secret-better-auth-init-force-password-reset';
const ADMIN_EMAIL = 'admin-init-force-reset@test.com';
const OLD_PASSWORD = 'OldPasswordThatIsLongEnoughZ!1';
const NEW_PASSWORD = 'NewPasswordThatIsLongEnoughZ!1';

describe('init.ts INKEEP_AUTH_INIT_FORCE_PASSWORD_RESET branch', () => {
  it('re-syncs the credential-account password against an existing user', async () => {
    const auth = createAuth({
      baseURL: 'http://localhost:3002',
      secret: BETTER_AUTH_SECRET,
      dbClient: testRunDbClient,
    });

    const signUp = await auth.api.signUpEmail({
      body: { email: ADMIN_EMAIL, password: OLD_PASSWORD, name: 'admin' },
    });
    expect(signUp.user).toBeDefined();
    if (signUp.token) {
      await auth.api.signOut({
        headers: new Headers({ authorization: `Bearer ${signUp.token}` }),
      });
    }

    const beforeOld = await auth.api.signInEmail({
      body: { email: ADMIN_EMAIL, password: OLD_PASSWORD },
      asResponse: true,
    });
    expect(beforeOld.status).toBe(200);

    const beforeNew = await auth.api.signInEmail({
      body: { email: ADMIN_EMAIL, password: NEW_PASSWORD },
      asResponse: true,
    });
    expect(beforeNew.status).toBe(401);

    // The exact code path from init.ts under
    // `INKEEP_AUTH_INIT_FORCE_PASSWORD_RESET === 'true'`.
    const ctx = await auth.$context;
    const hashedPassword = await hashPassword(NEW_PASSWORD);
    await ctx.internalAdapter.updatePassword(signUp.user.id, hashedPassword);

    const afterNew = await auth.api.signInEmail({
      body: { email: ADMIN_EMAIL, password: NEW_PASSWORD },
      asResponse: true,
    });
    expect(afterNew.status).toBe(200);

    const afterOld = await auth.api.signInEmail({
      body: { email: ADMIN_EMAIL, password: OLD_PASSWORD },
      asResponse: true,
    });
    expect(afterOld.status).toBe(401);
  });
});
