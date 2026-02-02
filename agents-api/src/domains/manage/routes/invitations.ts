import { createApiError, getPendingInvitationsByEmail } from '@inkeep/agents-core';
import { Hono } from 'hono';
import runDbClient from '../../../data/db/runDbClient';
import { sessionAuth } from '../../../middleware/sessionAuth';
import type { ManageAppVariables } from '../../../types/app';

const invitationsRoutes = new Hono<{ Variables: ManageAppVariables }>();

// Require authentication for all routes
invitationsRoutes.use('*', sessionAuth());

// GET /api/invitations/pending?email=user@example.com - Get pending invitations for an email
// Internal route - not exposed in OpenAPI spec
invitationsRoutes.get('/pending', async (c) => {
  const email = c.req.query('email');
  const authenticatedEmail = c.get('userEmail');

  if (!email) {
    throw createApiError({
      code: 'bad_request',
      message: 'Email parameter is required',
    });
  }

  // Only allow querying own invitations
  if (email !== authenticatedEmail) {
    throw createApiError({
      code: 'forbidden',
      message: 'Cannot access invitations for another email',
    });
  }

  const invitations = await getPendingInvitationsByEmail(runDbClient)(email);

  // Convert Date to timestamp number for API response
  const response = invitations.map((inv) => ({
    ...inv,
    expiresAt: inv.expiresAt instanceof Date ? inv.expiresAt.getTime() : inv.expiresAt,
  }));

  return c.json(response);
});

export default invitationsRoutes;
