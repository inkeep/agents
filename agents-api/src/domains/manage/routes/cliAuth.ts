import { OpenAPIHono, z } from '@hono/zod-openapi';
import { getUserOrganizationsFromDb } from '@inkeep/agents-core';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import { sessionAuth } from '../../../middleware/sessionAuth';
import type { ManageAppVariables } from '../../../types/app';

const cliAuthRoutes = new OpenAPIHono<{ Variables: ManageAppVariables }>();

// Response schema for /api/cli/me
const CLIMeResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string().nullable(),
  }),
  organization: z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    role: z.string(),
  }),
});

// GET /api/cli/me - Get current user info and their organization
cliAuthRoutes.openapi(
  createProtectedRoute({
    method: 'get',
    path: '/me',
    tags: ['CLI'],
    summary: 'Get CLI user info',
    description: 'Get the current authenticated user and their organization for CLI usage',
    permission: sessionAuth(),
    responses: {
      200: {
        description: 'User info with organization',
        content: {
          'application/json': {
            schema: CLIMeResponseSchema,
          },
        },
      },
      401: {
        description: 'Not authenticated',
      },
      404: {
        description: 'User has no organization',
      },
    },
  }),
  async (c) => {
    const user = c.get('user');
    const userId = c.get('userId');

    if (!user || !userId) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    // Get user's organizations (assuming single org per user)
    const organizations = await getUserOrganizationsFromDb(runDbClient)(userId);

    if (organizations.length === 0) {
      return c.json({ error: 'User has no organization' }, 404);
    }

    // Return the first (and only) organization
    const org = organizations[0];

    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name || null,
      },
      organization: {
        id: org.organizationId,
        name: org.organizationName || '',
        slug: org.organizationSlug || '',
        role: org.role,
      },
    });
  }
);

export default cliAuthRoutes;
