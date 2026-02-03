/**
 * Slack Resources Routes
 *
 * Endpoints for listing projects and agents:
 * - GET /projects - List projects for tenant
 * - GET /projects/:projectId/agents - List agents in project
 * - GET /agents - List all agents (flat view)
 */

import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import { listAgents, listProjectsPaginated } from '@inkeep/agents-core';
import manageDbClient from '../../db/manageDbClient';
import { getLogger } from '../../logger';
import type { WorkAppsVariables } from '../types';

const logger = getLogger('slack-resources');

const app = new OpenAPIHono<{ Variables: WorkAppsVariables }>();

const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  description: z.string().nullable().optional(),
});

const AgentSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  projectId: z.string(),
  projectName: z.string().nullable().optional(),
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/projects',
    summary: 'List Projects',
    description: 'List all projects for the tenant',
    operationId: 'slack-list-projects',
    tags: ['Work Apps', 'Slack', 'Resources'],
    request: {
      query: z.object({
        tenantId: z.string().optional().default('default'),
        limit: z.coerce.number().optional().default(100),
      }),
    },
    responses: {
      200: {
        description: 'List of projects',
        content: {
          'application/json': {
            schema: z.object({
              projects: z.array(ProjectSchema),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { tenantId, limit } = c.req.valid('query');

    try {
      const result = await listProjectsPaginated(manageDbClient)({
        tenantId,
        pagination: { limit },
      });

      return c.json({
        projects: result.data.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
        })),
      });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to list projects');
      return c.json({ projects: [] });
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/projects/:projectId/agents',
    summary: 'List Agents in Project',
    description: 'List all agents within a specific project',
    operationId: 'slack-list-project-agents',
    tags: ['Work Apps', 'Slack', 'Resources'],
    request: {
      params: z.object({
        projectId: z.string(),
      }),
      query: z.object({
        tenantId: z.string().optional().default('default'),
      }),
    },
    responses: {
      200: {
        description: 'List of agents',
        content: {
          'application/json': {
            schema: z.object({
              agents: z.array(AgentSchema),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { projectId } = c.req.valid('param');
    const { tenantId } = c.req.valid('query');

    try {
      const agents = await listAgents(manageDbClient)({
        scopes: { tenantId, projectId },
      });

      return c.json({
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          projectId,
          projectName: undefined,
        })),
      });
    } catch (error) {
      logger.error({ error, tenantId, projectId }, 'Failed to list agents');
      return c.json({ agents: [] });
    }
  }
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/agents',
    summary: 'List All Agents',
    description: 'List all agents across all projects (flat view)',
    operationId: 'slack-list-all-agents',
    tags: ['Work Apps', 'Slack', 'Resources'],
    request: {
      query: z.object({
        tenantId: z.string().optional().default('default'),
      }),
    },
    responses: {
      200: {
        description: 'List of agents',
        content: {
          'application/json': {
            schema: z.object({
              agents: z.array(AgentSchema),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { tenantId } = c.req.valid('query');

    try {
      const projectsResult = await listProjectsPaginated(manageDbClient)({
        tenantId,
        pagination: { limit: 100 },
      });

      const allAgents: z.infer<typeof AgentSchema>[] = [];

      for (const project of projectsResult.data || []) {
        try {
          const agents = await listAgents(manageDbClient)({
            scopes: { tenantId, projectId: project.id },
          });

          for (const agent of agents) {
            allAgents.push({
              id: agent.id,
              name: agent.name,
              projectId: project.id,
              projectName: project.name,
            });
          }
        } catch {
          logger.warn({ projectId: project.id }, 'Failed to fetch agents for project');
        }
      }

      return c.json({ agents: allAgents });
    } catch (error) {
      logger.error({ error, tenantId }, 'Failed to list agents');
      return c.json({ agents: [] });
    }
  }
);

export default app;
