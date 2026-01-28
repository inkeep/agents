import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi';
import {
  commonGetErrorResponses,
  commonUpdateErrorResponses,
  createApiError,
  GitHubAppRepositorySelectSchema,
  getProjectRepositoryAccess,
  getProjectRepositoryAccessWithDetails,
  setProjectRepositoryAccess,
  TenantProjectParamsSchema,
  validateRepositoryOwnership,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';
import type { ManageAppVariables } from '../../../types/app';

const logger = getLogger('project-github-access');

const app = new OpenAPIHono<{ Variables: ManageAppVariables }>();

const GitHubAccessModeSchema = z
  .enum(['all', 'selected'])
  .describe(
    'Access mode: "all" means project has access to all tenant repositories, ' +
      '"selected" means project is scoped to specific repositories'
  );

const SetGitHubAccessRequestSchema = z.object({
  mode: GitHubAccessModeSchema,
  repositoryIds: z
    .array(z.string())
    .optional()
    .describe('Internal repository IDs (required when mode="selected")'),
});

const GetGitHubAccessResponseSchema = z.object({
  mode: GitHubAccessModeSchema,
  repositories: z
    .array(GitHubAppRepositorySelectSchema)
    .describe(
      'List of repositories the project has access to (only populated when mode="selected")'
    ),
});

const SetGitHubAccessResponseSchema = z.object({
  mode: GitHubAccessModeSchema,
  repositoryCount: z
    .number()
    .describe('Number of repositories the project now has access to (0 when mode="all")'),
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: 'Get project GitHub repository access',
    operationId: 'get-project-github-access',
    tags: ['GitHub', 'Projects'],
    description:
      'Returns the current GitHub repository access configuration for a project. ' +
      'If mode is "all", the project has access to all repositories from tenant GitHub installations. ' +
      'If mode is "selected", the project is scoped to specific repositories.',
    request: {
      params: TenantProjectParamsSchema,
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
    const { tenantId, projectId } = c.req.valid('param');

    logger.info({ tenantId, projectId }, 'Getting project GitHub access configuration');

    const accessEntries = await getProjectRepositoryAccess(runDbClient)(projectId);

    if (accessEntries.length === 0) {
      logger.info({ tenantId, projectId }, 'Project has access to all repositories (mode=all)');
      return c.json(
        {
          mode: 'all' as const,
          repositories: [],
        },
        200
      );
    }

    const repositoriesWithDetails =
      await getProjectRepositoryAccessWithDetails(runDbClient)(projectId);

    logger.info(
      { tenantId, projectId, repositoryCount: repositoriesWithDetails.length },
      'Got project GitHub access configuration (mode=selected)'
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
    summary: 'Set project GitHub repository access',
    operationId: 'set-project-github-access',
    tags: ['GitHub', 'Projects'],
    description:
      'Configures which GitHub repositories a project can access. ' +
      'When mode is "all", the project has access to all repositories from tenant GitHub installations. ' +
      'When mode is "selected", the project is scoped to specific repositories (repositoryIds required). ' +
      'This replaces any existing access configuration.',
    request: {
      params: TenantProjectParamsSchema,
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
    const { tenantId, projectId } = c.req.valid('param');
    const { mode, repositoryIds } = c.req.valid('json');

    logger.info({ tenantId, projectId, mode }, 'Setting project GitHub access configuration');

    if (mode === 'selected') {
      if (!repositoryIds || repositoryIds.length === 0) {
        logger.warn({ tenantId, projectId }, 'repositoryIds required when mode is selected');
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
          { tenantId, projectId, invalidRepoIds },
          'Some repository IDs do not belong to tenant installations'
        );
        throw createApiError({
          code: 'bad_request',
          message: `Invalid repository IDs: ${invalidRepoIds.join(', ')}. Repositories must belong to GitHub installations owned by this tenant.`,
        });
      }

      await setProjectRepositoryAccess(runDbClient)({
        tenantId,
        projectId,
        repositoryIds,
      });

      logger.info(
        { tenantId, projectId, repositoryCount: repositoryIds.length },
        'Project GitHub access set to selected repositories'
      );

      return c.json(
        {
          mode: 'selected' as const,
          repositoryCount: repositoryIds.length,
        },
        200
      );
    }

    await setProjectRepositoryAccess(runDbClient)({
      tenantId,
      projectId,
      repositoryIds: [],
    });

    logger.info({ tenantId, projectId }, 'Project GitHub access set to all repositories');

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
