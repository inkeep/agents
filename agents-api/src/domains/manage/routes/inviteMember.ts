import { OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonCreateErrorResponses,
  createApiError,
  createInvitationProjectAssignments,
  listProjectsMetadata,
  OrgRoles,
  ProjectRoles,
} from '@inkeep/agents-core';
import { createProtectedRoute, inheritedManageTenantAuth } from '@inkeep/agents-core/middleware';
import runDbClient from '../../../data/db/runDbClient';
import type { ManageAppVariables } from '../../../types/app';

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const projectRoleEnum = z.enum([ProjectRoles.ADMIN, ProjectRoles.MEMBER, ProjectRoles.VIEWER]);

const AssignmentSchema = z.object({
  projectId: z.string(),
  projectRole: projectRoleEnum,
});

const InviteMemberBodySchema = z.object({
  emails: z.array(z.string().email()),
  role: z.enum([OrgRoles.OWNER, OrgRoles.ADMIN, OrgRoles.MEMBER]),
  organizationId: z.string(),
  assignments: z.array(AssignmentSchema).optional(),
});

const InviteResultSchema = z.object({
  email: z.string(),
  status: z.enum(['success', 'error']),
  id: z.string().optional(),
  link: z.string().optional(),
  error: z.string().optional(),
  compensated: z.boolean().optional(),
});

const InviteMemberResponseSchema = z.object({
  data: z.array(InviteResultSchema),
});

app.openapi(
  createProtectedRoute({
    method: 'post',
    path: '/',
    summary: 'Invite Members',
    description:
      'Invite one or more members to an organization, optionally granting project access upon acceptance.',
    operationId: 'invite-members',
    tags: ['Invitations'],
    permission: inheritedManageTenantAuth(),
    request: {
      body: {
        content: {
          'application/json': {
            schema: InviteMemberBodySchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'Per-email invite results',
        content: {
          'application/json': {
            schema: InviteMemberResponseSchema,
          },
        },
      },
      ...commonCreateErrorResponses,
    },
  }),
  async (c) => {
    const auth = c.get('auth');
    if (!auth) {
      throw createApiError({ code: 'internal_server_error', message: 'Auth not configured' });
    }

    const activeMember = await auth.api.getActiveMember({ headers: c.req.raw.headers });
    if (
      !activeMember ||
      (activeMember.role !== OrgRoles.ADMIN && activeMember.role !== OrgRoles.OWNER)
    ) {
      throw createApiError({
        code: 'forbidden',
        message: 'Only org admins or owners can invite members',
      });
    }

    const { emails, role, organizationId, assignments } = c.req.valid('json');

    if (assignments && assignments.length > 0) {
      const projects = await listProjectsMetadata(runDbClient)({ tenantId: organizationId });
      const validProjectIds = new Set(projects.map((p) => p.id));
      const invalidIds = assignments
        .map((a) => a.projectId)
        .filter((id) => !validProjectIds.has(id));
      if (invalidIds.length > 0) {
        throw createApiError({
          code: 'bad_request',
          message: `Invalid project IDs: ${invalidIds.join(', ')}`,
        });
      }
    }

    const results: z.infer<typeof InviteResultSchema>[] = [];

    for (const email of emails) {
      let invitationId: string | undefined;
      try {
        const invitation = await auth.api.createInvitation({
          body: { email, role, organizationId },
          headers: c.req.raw.headers,
        });

        invitationId = invitation?.id;

        if (invitationId && assignments && assignments.length > 0) {
          await createInvitationProjectAssignments(runDbClient)(
            invitationId,
            assignments.map((a) => ({ projectId: a.projectId, projectRole: a.projectRole }))
          );
        }

        results.push({ email, status: 'success', id: invitation?.id });
      } catch (err) {
        if (invitationId) {
          let compensated = false;
          try {
            await auth.api.cancelInvitation({
              body: { invitationId },
              headers: c.req.raw.headers,
            });
            compensated = true;
          } catch {
            // compensation failed — nothing more we can do
          }
          results.push({
            email,
            status: 'error',
            error: err instanceof Error ? err.message : 'Failed to store project assignments',
            compensated,
          });
        } else {
          results.push({
            email,
            status: 'error',
            error: err instanceof Error ? err.message : 'Failed to create invitation',
          });
        }
      }
    }

    return c.json({ data: results });
  }
);

export default app;
