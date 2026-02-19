/**
 * Work Apps Authentication Middleware
 *
 * Shared session/API key auth for protected work app routes (Slack, GitHub, etc.).
 * Most work app routes are unauthenticated (events, commands, webhooks),
 * but workspace management and user endpoints require session auth.
 *
 * Auth flow:
 * 1. Test environment → bypass
 * 2. Dev localhost → bypass with dev-user context
 * 3. Bearer token → manageApiKeyAuth
 * 4. Session cookie → sessionAuth
 */

import { createApiError } from '@inkeep/agents-core';
import type { Context, Next } from 'hono';
import { env } from '../env';
import { manageApiKeyAuth } from './manageAuth';
import { sessionAuth } from './sessionAuth';

const isTestEnvironment = () => env.ENVIRONMENT === 'test';

export const workAppsAuth = async (c: Context, next: Next) => {
  if (isTestEnvironment()) {
    await next();
    return;
  }

  // DEV ONLY: Allow localhost origins without strict session auth
  // Cross-origin cookies don't work between localhost:3000 and localhost:3002 during development.
  // In production, the dashboard and API share a domain so session cookies work natively.
  // When a real session exists (set by the global sessionContext middleware), prefer it so that
  // endpoints requiring a real user identity (e.g. Slack account linking) work correctly.
  if (env.ENVIRONMENT === 'development') {
    const origin = c.req.header('Origin');
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1') {
          const sessionUser = c.get('user') as { id: string; email: string } | null;
          const session = c.get('session') as { activeOrganizationId?: string } | null;

          if (sessionUser?.id) {
            c.set('userId', sessionUser.id);
            c.set('userEmail', sessionUser.email);
            c.set('tenantId', session?.activeOrganizationId || 'default');
            c.set('tenantRole', 'owner');
          } else {
            c.set('userId', 'dev-user');
            c.set('tenantId', 'default');
            c.set('tenantRole', 'owner');
          }

          await next();
          return;
        }
      } catch {
        // Invalid origin URL, continue to auth check
      }
    }
  }

  // Bearer token → API key auth, otherwise → session auth (dashboard cookies)
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return manageApiKeyAuth()(c as any, next);
  }

  // Session auth for dashboard users
  await sessionAuth()(c as any, async () => {
    // Resolve tenantId from the session's active organization
    // sessionAuth sets userId/userEmail but not tenantId — we need it for tenant-scoped queries
    const session = c.get('session') as { activeOrganizationId?: string } | null;
    if (!session?.activeOrganizationId) {
      throw createApiError({
        code: 'forbidden',
        message: 'No active organization selected. Please select an organization first.',
      });
    }
    c.set('tenantId', session.activeOrganizationId);
    await next();
  });
};
