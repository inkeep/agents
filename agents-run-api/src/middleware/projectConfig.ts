import {
  type FullExecutionContext,
  InternalServices,
  ManageApiError,
  ManagementApiClient,
} from '@inkeep/agents-core';
import { createMiddleware } from 'hono/factory';

import { env } from '../env';
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
  };
}>(async (c, next) => {
  const executionContext = c.get('executionContext');
  const { tenantId, projectId, ref } = executionContext;

  logger.debug(
    {
      tenantId,
      projectId,
      ref,
    },
    'Fetching project config from Management API'
  );

  try {
    const client = new ManagementApiClient({
      apiUrl: env.INKEEP_AGENTS_MANAGE_API_URL,
      tenantId,
      projectId,
      auth: {
        mode: 'internalService',
        internalServiceName: InternalServices.INKEEP_AGENTS_RUN_API,
      },
      ref,
    });

    const resolvedRef = await client.getResolvedRef();

    if (!resolvedRef) {
      throw new Error('Resolved ref not found');
    }

    //TODO: support tag and commit refs (just branch for now)
    if (resolvedRef.type !== 'branch') {
      throw new Error(
        `Runtime operations require a branch ref. Got ${resolvedRef.type} '${resolvedRef.name}'.`
      );
    }

    const projectConfig = await client.getFullProject();

    c.set('executionContext', {
      ...executionContext,
      project: projectConfig,
      resolvedRef,
    });

    logger.debug(
      {
        tenantId,
        projectId,
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
