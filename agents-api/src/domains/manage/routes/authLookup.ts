import { createApiError, getAuthLookupForEmail } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';

const logger = getLogger('auth-lookup');

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const ipRequestTimestamps = new Map<string, number[]>();

setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, timestamps] of ipRequestTimestamps) {
    const recent = timestamps.filter((t) => t > cutoff);
    if (recent.length === 0) {
      ipRequestTimestamps.delete(ip);
    } else {
      ipRequestTimestamps.set(ip, recent);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

function getClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'unknown'
  );
}

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
 * Rate-limited per IP to mitigate email/org enumeration.
 * organizationSlug is intentionally omitted from the response to minimize info disclosure.
 */
authLookupRoutes.get('/', async (c) => {
  const clientIp = getClientIp(c);
  const now = Date.now();
  const timestamps = ipRequestTimestamps.get(clientIp) || [];
  const recent = timestamps.filter((t) => t > now - RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    logger.warn({ clientIp, count: recent.length }, 'auth-lookup rate limit exceeded');
    throw createApiError({
      code: 'too_many_requests',
      message: 'Too many requests. Please try again later.',
    });
  }

  recent.push(now);
  ipRequestTimestamps.set(clientIp, recent);

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

    const sanitized = organizations.map(({ organizationSlug: _slug, ...rest }) => rest);

    logger.info(
      { clientIp, emailDomain: email.split('@')[1], orgCount: organizations.length },
      'auth-lookup completed'
    );

    return c.json({ organizations: sanitized });
  } catch (error) {
    if (error instanceof HTTPException) {
      throw error;
    }

    logger.error({ clientIp, error }, 'auth-lookup failed');
    throw createApiError({
      code: 'internal_server_error',
      message: 'Failed to look up authentication method',
    });
  }
});

export default authLookupRoutes;
