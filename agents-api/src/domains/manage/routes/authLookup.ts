import { createApiError, getAuthLookupForEmail } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import runDbClient from '../../../data/db/runDbClient';
import type { ManageAppVariables } from '../../../types/app';

const authLookupRoutes = new Hono<{ Variables: ManageAppVariables }>();

/**
 * GET /api/auth-lookup?email=user@example.com
 *
 * Unauthenticated endpoint for the email-first login flow.
 * Returns org-aware auth methods:
 *  1. Checks SSO providers by email domain -> resolves org -> returns org's allowed methods (SSO filtered to domain-matched providers)
 *  2. Checks existing user account -> resolves org membership -> returns org's allowed methods (SSO filtered to domain-matched providers)
 *
 * Returns empty organizations array if no match is found.
 *
 * Response shape: `{ organizations: OrgAuthInfo[] }`.
 */
authLookupRoutes.get('/', async (c) => {
  const email = c.req.query('email');

  if (!email) {
    throw createApiError({
      code: 'bad_request',
      message: 'Email parameter is required',
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw createApiError({
      code: 'bad_request',
      message: 'Invalid email format',
    });
  }

  try {
    const organizations = await getAuthLookupForEmail(runDbClient)(email);

    return c.json({ organizations });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('[auth-lookup] Error looking up auth method:', error);
    throw createApiError({
      code: 'internal_server_error',
      message: 'Failed to look up authentication method',
    });
  }
});

export default authLookupRoutes;
