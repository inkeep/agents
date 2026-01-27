import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { getPendingInvitationsByEmail } from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import type { ManageAppVariables } from '../../../types/app';

const invitationsRoutes = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const PendingInvitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  organizationId: z.string(),
  organizationName: z.string().nullable(),
  organizationSlug: z.string().nullable(),
  role: z.string().nullable(),
  status: z.string(),
  expiresAt: z.number(),
  inviterId: z.string(),
});

const PendingInvitationsResponseSchema = z.array(PendingInvitationSchema);

// GET /api/invitations/pending?email=user@example.com - Get pending invitations for an email
invitationsRoutes.openapi(
  createRoute({
    method: 'get',
    path: '/pending',
    tags: ['Invitations'],
    summary: 'Get pending invitations',
    description: 'Get all pending (non-expired) invitations for a given email address',
    request: {
      query: z.object({
        email: z.email().describe('Email address to check for invitations'),
      }),
    },
    responses: {
      200: {
        description: 'List of pending invitations',
        content: {
          'application/json': {
            schema: PendingInvitationsResponseSchema,
          },
        },
      },
    },
  }),
  async (c) => {
    const { email } = c.req.valid('query');

    const invitations = await getPendingInvitationsByEmail(runDbClient)(email);

    // Convert Date to timestamp number for API response
    const response = invitations.map((inv) => ({
      ...inv,
      expiresAt: inv.expiresAt instanceof Date ? inv.expiresAt.getTime() : inv.expiresAt,
    }));

    return c.json(response);
  }
);

export default invitationsRoutes;
