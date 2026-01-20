import type { BaseExecutionContext, FullExecutionContext, ResolvedRef } from '@inkeep/agents-core';
import { getFullProjectWithRelationIds, ManageApiError, withRef } from '@inkeep/agents-core';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import manageDbPool from '../data/db/manageDbPool';
import { getLogger } from '../logger';

const logger = getLogger('projectConfigMiddleware');

/**
 * Core handler that fetches the full project definition from the Management API
 * and adds it to the Hono context for use in route handlers.
 *
 * This handler should be applied after authentication middleware since it
 * requires the execution context to be set.
 */
async function projectConfigHandler(
  c: Context<{ Variables: { executionContext: BaseExecutionContext; resolvedRef: ResolvedRef } }>,
  next: () => Promise<void>
): Promise<Response | undefined> {
  // At this point, executionContext is BaseExecutionContext from auth middleware
  // We'll upgrade it to FullExecutionContext by adding project and resolvedRef
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
    } as FullExecutionContext);

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
}

/**
 * Middleware that fetches the full project definition from the Management API
 */
export const projectConfigMiddleware = createMiddleware<{
  Variables: {
    executionContext: BaseExecutionContext;
    resolvedRef: ResolvedRef;
  };
}>(projectConfigHandler);

/**
 * Creates a middleware that applies project config fetching except for specified route patterns
 * @param skipRouteCheck - Function that returns true if the route should skip the middleware
 */
export const projectConfigMiddlewareExcept = (skipRouteCheck: (path: string) => boolean) =>
  createMiddleware<{
    Variables: {
      executionContext: BaseExecutionContext;
      resolvedRef: ResolvedRef;
    };
  }>(async (c, next) => {
    if (skipRouteCheck(c.req.path)) {
      return next();
    }
    return projectConfigHandler(c, next);
  });
