import {
  type FullExecutionContext,
  getFullProjectWithRelationIds,
  ManageApiError,
  type ResolvedRef,
  withRef,
} from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';
import manageDbPool from '../data/db/manageDbPool';
import { getLogger } from '../logger';

const logger = getLogger('projectConfigMiddleware');

/**
 * Middleware that fetches the full project definition from the Management API
 * and adds it to the Hono context for use in route handlers.
 *
 * This middleware should be applied after authentication middleware since it
 * requires the execution context to be set.
 */
export const projectConfigMiddleware = createMiddleware<{
  Variables: {
    executionContext: FullExecutionContext;
    resolvedRef: ResolvedRef;
  };
}>(async (c, next) => {
  const executionContext = c.get('executionContext');
  const resolvedRef = c.get('resolvedRef');
  const { tenantId, projectId } = executionContext;

  logger.debug(
    {
      tenantId,
      projectId,
      resolvedRef,
    },
    'Fetching project config from Management API'
  );

  try {
    if (!resolvedRef) {
      throw new Error('Resolved ref not found');
    }

    //TODO: support tag and commit refs (just branch for now)
    if (resolvedRef.type !== 'branch') {
      throw new Error(
        `Runtime operations require a branch ref. Got ${resolvedRef.type} '${resolvedRef.name}'.`
      );
    }

    const projectConfig = await withRef(manageDbPool, resolvedRef, async (db) => {
      return await getFullProjectWithRelationIds(db)({
        scopes: { tenantId, projectId },
      });
    });

    if (!projectConfig) {
      throw new Error('Project not found');
    }

    c.set('executionContext', {
      ...executionContext,
      project: projectConfig,
      resolvedRef,
    });

    logger.debug(
      {
        tenantId,
        projectId,
        resolvedRef,
        agentCount: Object.keys(projectConfig.agents || {}).length,
        toolCount: Object.keys(projectConfig.tools || {}).length,
      },
      'Project config fetched successfully'
    );

    await next();
  } catch (error) {
    if (error instanceof ManageApiError) {
      logger.error(
        {
          tenantId,
          projectId,
          statusCode: error.statusCode,
          message: error.message,
        },
        'Failed to fetch project config from Management API'
      );

      if (error.isNotFound) {
        return c.json(
          {
            error: 'Project not found',
            message: `Project ${projectId} not found for tenant ${tenantId}`,
          },
          404
        );
      }

      if (error.isUnauthorized || error.isForbidden) {
        return c.json(
          {
            error: 'Access denied',
            message: 'Unable to access project configuration',
          },
          403
        );
      }
    }

    logger.error(
      {
        tenantId,
        projectId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Unexpected error fetching project config'
    );

    return c.json(
      {
        error: 'Internal server error',
        message: 'Failed to load project configuration',
      },
      500
    );
  }
});
