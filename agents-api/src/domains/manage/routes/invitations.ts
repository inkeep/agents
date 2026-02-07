import { createApiError, getPendingInvitationsByEmail } from '@inkeep/agents-core';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import runDbClient from '../../../data/db/runDbClient';
import { sessionAuth } from '../../../middleware/sessionAuth';
import type { ManageAppVariables } from '../../../types/app';

const invitationsRoutes = new Hono<{ Variables: ManageAppVariables }>();

/**
 * GET /api/invitations/verify?email=user@example.com&id=xxx
 *
 * Unauthenticated endpoint to validate an invitation exists and get preview info.
 * Used by the accept-invitation page to pre-populate signup forms.
 *
 * Returns limited info: email, organizationName, organizationId, role, expiresAt
 */
invitationsRoutes.get('/verify', async (c) => {
  const email = c.req.query('email');
  const invitationId = c.req.query('id');

  if (!email) {
    throw createApiError({
      code: 'bad_request',
      message: 'Email parameter is required',
    });
  }

  if (!invitationId) {
    throw createApiError({
      code: 'bad_request',
      message: 'Invitation ID parameter is required',
    });
  }

  const auth = c.get('auth');
  if (!auth) {
    throw createApiError({
      code: 'internal_server_error',
      message: 'Auth not configured',
    });
  }

  try {
    // Use Better Auth's listUserInvitations with email query (server-side only)
    const invitations = await auth.api.listUserInvitations({
      query: { email },
    });

    // Find the specific invitation by ID
    const invitation = Array.isArray(invitations)
      ? invitations.find((inv: { id: string }) => inv.id === invitationId)
      : null;

    if (!invitation) {
      throw createApiError({
        code: 'not_found',
        message: 'Invitation not found',
      });
    }

    // Check if invitation is still pending and not expired
    const expiresAt = invitation.expiresAt ? new Date(invitation.expiresAt) : null;
    const isExpired = expiresAt && expiresAt < new Date();
    const isPending = invitation.status === 'pending';

    if (!isPending) {
      throw createApiError({
        code: 'not_found',
        message: 'Invitation is no longer valid',
      });
    }

    if (isExpired) {
      throw createApiError({
        code: 'not_found',
        message: 'Invitation has expired',
      });
    }

    // Return limited, safe information
    return c.json({
      valid: true,
      email: invitation.email,
      organizationName: invitation.organizationName || null,
      organizationId: invitation.organizationId,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    });
  } catch (error) {
    // Re-throw API errors (HTTPExceptions from createApiError)
    if (error instanceof HTTPException) {
      throw error;
    }

    console.error('[invitations/verify] Error fetching invitation:', error);
    throw createApiError({
      code: 'internal_server_error',
      message: 'Failed to validate invitation',
    });
  }
});

// Require authentication for remaining routes
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
