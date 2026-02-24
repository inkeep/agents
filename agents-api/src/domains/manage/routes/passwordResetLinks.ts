import {
  createApiError,
  type OrgRole,
  OrgRoles,
  waitForPasswordResetLink,
} from '@inkeep/agents-core';
import { Hono } from 'hono';
import { env } from '../../../env';
import { sessionAuth } from '../../../middleware/sessionAuth';
import type { ManageAppVariables } from '../../../types/app';

const passwordResetLinksRoutes = new Hono<{ Variables: ManageAppVariables }>();

passwordResetLinksRoutes.use('*', sessionAuth());

passwordResetLinksRoutes.post('/', async (c) => {
  const tenantId = c.req.param('tenantId');
  const { email } = (await c.req.json().catch(() => ({}))) as { email?: string };
  const userId = c.get('userId');

  if (!tenantId) {
    throw createApiError({ code: 'bad_request', message: 'Tenant ID is required' });
  }

  if (!userId) {
    throw createApiError({ code: 'unauthorized', message: 'Authentication required' });
  }

  if (!email) {
    throw createApiError({ code: 'bad_request', message: 'Email is required' });
  }

  const tenantRole = c.get('tenantRole') as OrgRole | undefined;
  if (!tenantRole || (tenantRole !== OrgRoles.ADMIN && tenantRole !== OrgRoles.OWNER)) {
    throw createApiError({ code: 'forbidden', message: 'Admin access required' });
  }

  const auth = c.get('auth');
  if (!auth) {
    throw createApiError({ code: 'internal_server_error', message: 'Auth not configured' });
  }

  const result = await auth.api.listMembers({
    query: { organizationId: tenantId },
    headers: c.req.raw.headers,
  });

  const isMember = result.members.some((m: { user: { email: string } }) => m.user.email === email);

  if (!isMember) {
    throw createApiError({
      code: 'forbidden',
      message: 'User is not a member of this organization',
    });
  }

  const manageUiBaseUrl = env.INKEEP_AGENTS_MANAGE_UI_URL || 'http://localhost:3000';
  const redirectTo = `${manageUiBaseUrl}/reset-password`;

  const linkPromise = waitForPasswordResetLink(email);

  await auth.api.requestPasswordReset({
    body: {
      email,
      redirectTo,
    },
  });

  try {
    const link = await linkPromise;
    return c.json({ url: link.url });
  } catch {
    throw createApiError({ code: 'internal_server_error', message: 'Reset link not available' });
  }
});

export default passwordResetLinksRoutes;
