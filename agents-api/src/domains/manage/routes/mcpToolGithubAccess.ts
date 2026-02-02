import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  type AgentsManageDatabaseClient,
  commonGetErrorResponses,
  commonUpdateErrorResponses,
  createApiError,
  getMcpToolAccessMode,
  getMcpToolRepositoryAccessWithDetails,
  getToolById,
  setMcpToolAccessMode,
  setMcpToolRepositoryAccess,
  TenantProjectParamsSchema,
  validateRepositoryOwnership,
  WorkAppGitHubAccessModeSchema,
  WorkAppGitHubAccessSetRequestSchema,
  WorkAppGitHubAccessSetResponseSchema,
  WorkAppGitHubRepositorySelectSchema,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import { requireProjectPermission } from '../../../middleware/projectAccess';
import type { ManageAppVariables } from '../../../types/app';

const logger = getLogger('mcp-tool-github-access');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const TenantProjectToolParamsSchema = TenantProjectParamsSchema.extend({
  toolId: z.string().min(1).describe('The tool ID'),
});

const McpToolGitHubAccessModeSchema = WorkAppGitHubAccessModeSchema.describe(
  'Access mode: "all" means the MCP tool has access to all project repositories, ' +
    '"selected" means the tool is scoped to specific repositories'
);

const SetGitHubAccessRequestSchema = WorkAppGitHubAccessSetRequestSchema.extend({
  mode: McpToolGitHubAccessModeSchema,
});

const GetGitHubAccessResponseSchema = z.object({
  mode: McpToolGitHubAccessModeSchema,
  repositories: z
    .array(
      WorkAppGitHubRepositorySelectSchema.extend({
        installationAccountLogin: z
          .string()
          .describe('The GitHub account login for the installation'),
      })
    )
    .describe(
      'List of repositories the MCP tool has access to (only populated when mode="selected")'
    ),
});

const SetGitHubAccessResponseSchema = WorkAppGitHubAccessSetResponseSchema.extend({
  mode: McpToolGitHubAccessModeSchema,
  repositoryCount: z
    .number()
    .describe('Number of repositories the MCP tool now has access to (0 when mode="all")'),
});

async function validateGitHubWorkappTool(
  db: AgentsManageDatabaseClient,
  tenantId: string,
  projectId: string,
  toolId: string
): Promise<void> {
  const tool = await getToolById(db)({
    scopes: { tenantId, projectId },
    toolId,
  });

  if (!tool) {
    throw createApiError({
      code: 'not_found',
      message: `Tool not found: ${toolId}`,
    });
  }

  if (!tool.isWorkApp) {
    throw createApiError({
      code: 'bad_request',
      message: 'GitHub access can only be configured for workapp MCP tools',
    });
  }

  const toolUrl = tool.config.mcp.server.url;
  if (!toolUrl?.includes('/github')) {
    throw createApiError({
      code: 'bad_request',
      message: 'GitHub access can only be configured for GitHub MCP tools',
    });
  }
}

// All operations on this route require 'edit' permission
app.use('/', requireProjectPermission<{ Variables: ManageAppVariables }>('edit'));

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'Get MCP tool GitHub repository access',
    operationId: 'get-mcp-tool-github-access',
    tags: ['Tools'],
    description:
      'Returns the current GitHub repository access configuration for an MCP tool. ' +
      'If mode is "all", the tool has access to all repositories the project can access. ' +
      'If mode is "selected", the tool is scoped to specific repositories. ',
    request: {
      params: TenantProjectToolParamsSchema,
    },
    responses: {
      200: {
        description: 'GitHub access configuration retrieved successfully',
        content: {
          'application/json': {
            schema: GetGitHubAccessResponseSchema,
          },
        },
      },
      ...commonGetErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, toolId } = c.req.valid('param');
    const db = c.get('db');

    logger.info({ tenantId, projectId, toolId }, 'Getting MCP tool GitHub access configuration');

    await validateGitHubWorkappTool(db, tenantId, projectId, toolId);

    // Get explicit mode from mode table (defaults to 'selected' if not set)
    const mode = await getMcpToolAccessMode(runDbClient)(toolId);

    if (mode === 'all') {
      logger.info(
        { tenantId, projectId, toolId },
        'MCP tool has access to all project repositories (mode=all)'
      );
      return c.json(
        {
          mode: 'all' as const,
          repositories: [],
        },
        200
      );
    }

    // mode === 'selected': get the specific repositories
    const repositoriesWithDetails =
      await getMcpToolRepositoryAccessWithDetails(runDbClient)(toolId);

    logger.info(
      { tenantId, projectId, toolId, repositoryCount: repositoriesWithDetails.length },
      'Got MCP tool GitHub access configuration (mode=selected)'
    );

    return c.json(
      {
        mode: 'selected' as const,
        repositories: repositoriesWithDetails.map((repo) => ({
          id: repo.id,
          installationDbId: repo.installationDbId,
          repositoryId: repo.repositoryId,
          repositoryName: repo.repositoryName,
          repositoryFullName: repo.repositoryFullName,
          private: repo.private,
          createdAt: repo.createdAt,
          updatedAt: repo.updatedAt,
          installationAccountLogin: repo.installationAccountLogin,
        })),
      },
      200
    );
  }
);

app.openapi(
  createRoute({
    method: 'put',
    path: '/',
    summary: 'Set MCP tool GitHub repository access',
    operationId: 'set-mcp-tool-github-access',
    tags: ['Tools'],
    description:
      'Configures which GitHub repositories an MCP tool can access. ' +
      'When mode is "all", the tool has access to all repositories the project can access. ' +
      'When mode is "selected", the tool is scoped to specific repositories (repositoryIds required). ' +
      'This replaces any existing access configuration. ' +
      'This endpoint only works for GitHub workapp MCP tools (isWorkApp=true and URL contains /github).',
    request: {
      params: TenantProjectToolParamsSchema,
      body: {
        content: {
          'application/json': {
            schema: SetGitHubAccessRequestSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: 'GitHub access configuration updated successfully',
        content: {
          'application/json': {
            schema: SetGitHubAccessResponseSchema,
          },
        },
      },
      ...commonUpdateErrorResponses,
    },
  }),
  async (c) => {
    const { tenantId, projectId, toolId } = c.req.valid('param');
    const { mode, repositoryIds } = c.req.valid('json');
    const db = c.get('db');

    logger.info(
      { tenantId, projectId, toolId, mode },
      'Setting MCP tool GitHub access configuration'
    );

    await validateGitHubWorkappTool(db, tenantId, projectId, toolId);

    if (mode === 'selected') {
      if (!repositoryIds || repositoryIds.length === 0) {
        logger.warn(
          { tenantId, projectId, toolId },
          'repositoryIds required when mode is selected'
        );
        throw createApiError({
          code: 'bad_request',
          message: 'repositoryIds is required when mode is "selected"',
        });
      }

      const invalidRepoIds = await validateRepositoryOwnership(runDbClient)({
        tenantId,
        repositoryIds,
      });

      if (invalidRepoIds.length > 0) {
        logger.warn(
          { tenantId, projectId, toolId, invalidRepoIds },
          'Some repository IDs do not belong to tenant installations'
        );
        throw createApiError({
          code: 'bad_request',
          message: `Invalid repository IDs: ${invalidRepoIds.join(', ')}. Repositories must belong to GitHub installations owned by this tenant.`,
        });
      }

      // Set explicit mode and repository access
      await setMcpToolAccessMode(runDbClient)({ toolId, tenantId, projectId, mode: 'selected' });
      await setMcpToolRepositoryAccess(runDbClient)({
        toolId,
        tenantId,
        projectId,
        repositoryIds,
      });

      logger.info(
        { tenantId, projectId, toolId, repositoryCount: repositoryIds.length },
        'MCP tool GitHub access set to selected repositories'
      );

      return c.json(
        {
          mode: 'selected' as const,
          repositoryCount: repositoryIds.length,
        },
        200
      );
    }

    // mode === 'all': Set explicit mode and clear any repository access entries
    await setMcpToolAccessMode(runDbClient)({ toolId, tenantId, projectId, mode: 'all' });
    await setMcpToolRepositoryAccess(runDbClient)({
      toolId,
      tenantId,
      projectId,
      repositoryIds: [],
    });

    logger.info(
      { tenantId, projectId, toolId },
      'MCP tool GitHub access set to all project repositories'
    );

    return c.json(
      {
        mode: 'all' as const,
        repositoryCount: 0,
      },
      200
    );
  }
);

export default app;
