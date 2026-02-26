import {
  type AgentsManageDatabaseClient,
  type BaseExecutionContext,
  createApiError,
  ensureBranchExists,
  getLogger,
  getProjectScopedRef,
  getTenantScopedRef,
  isRefWritable,
  type ResolvedRef,
  resolveRef,
} from '@inkeep/agents-core';
import type { Context, Next } from 'hono';
import { manageDbClient } from '../data/db';

const logger = getLogger('ref-middleware');

export type RefContext = {
  resolvedRef?: ResolvedRef;
};

export interface RefMiddlewareOptions {
  /**
   * Extract tenantId from the request context.
   * Default implementation extracts from path using /tenants/{tenantId} pattern.
   */
  extractTenantId?: (c: Context) => string | undefined;

  /**
   * Extract projectId from the request context.
   * Default implementation extracts from path using /tenants/{tenantId}/projects/{projectId} pattern.
   */
  extractProjectId?: (c: Context) => string | undefined;

  /**
   * Whether to allow extracting projectId from request body for POST/PUT/PATCH.
   * Default: true
   */
  allowProjectIdFromBody?: boolean;

  /**
   * Custom path patterns that should skip ref validation.
   * Default: []
   */
  skipRefValidationPaths?: RegExp[];
}

/**
 * Default tenant ID extractor - extracts from /tenants/{tenantId} path pattern
 */
const defaultExtractTenantId = (c: Context): string | undefined => {
  const path = c.req.path;
  const tenantPathRegex = /^\/(?:manage|run)\/tenants\/([^/]+)/;
  const match = path.match(tenantPathRegex);
  return match?.[1];
};

/**
 * Default project ID extractor - extracts from /tenants/{tenantId}/projects/{projectId} or
 * /tenants/{tenantId}/project-full/{projectId} path patterns
 */
const defaultExtractProjectId = (c: Context): string | undefined => {
  const path = c.req.path;
  const projectPathRegex =
    /^\/(?:manage|run)\/tenants\/[^/]+\/(?:projects|project-full)(?:\/([^/]+))?/;
  const match = path.match(projectPathRegex);
  return match?.[1];
};

/**
 * Extract tenantId from the executionContext set by apiKeyAuth middleware.
 */
const extractTenantIdFromExecutionContext = (c: Context): string | undefined => {
  const executionContext = c.get('executionContext') as BaseExecutionContext | undefined;
  let tenantId: string | undefined;
  if (executionContext) {
    tenantId = executionContext.tenantId;
  } else {
    tenantId = defaultExtractTenantId(c);
  }

  return tenantId;
};

/**
 * Extract projectId from the executionContext set by apiKeyAuth middleware.
 */
const extractProjectIdFromExecutionContext = (c: Context): string | undefined => {
  const executionContext = c.get('executionContext') as BaseExecutionContext | undefined;
  let projectId: string | undefined;
  if (executionContext) {
    projectId = executionContext.projectId;
  } else {
    projectId = defaultExtractProjectId(c);
  }
  return projectId;
};

/**
 * Creates a ref resolution middleware factory.
 *
 * This middleware:
 * 1. Extracts tenantId and projectId from the request
 * 2. Resolves the `ref` query parameter to a ResolvedRef
 * 3. Creates branches if needed (tenant_main, project_main)
 * 4. Sets `resolvedRef` in the Hono context for downstream handlers
 *
 * @param db - The Doltgres database client to use for ref resolution
 * @param options - Optional configuration for extraction and validation
 * @returns Hono middleware function
 *
 * @example
 * ```typescript
 * import { createRefMiddleware } from '@inkeep/agents-core';
 * import { manageDbClient } from './db';
 *
 * const refMiddleware = createRefMiddleware(manageDbClient);
 * app.use('/tenants/*', refMiddleware);
 * ```
 */
export const createRefMiddleware = (
  db: AgentsManageDatabaseClient,
  options: RefMiddlewareOptions = {}
) => {
  const {
    extractTenantId = defaultExtractTenantId,
    extractProjectId = defaultExtractProjectId,
    allowProjectIdFromBody = true,
  } = options;

  return async (c: Context, next: Next) => {
    const ref = c.req.query('ref');
    const path = c.req.path;
    const pathSplit = path.split('/');

    const tenantId = extractTenantId(c);
    let projectId = extractProjectId(c);

    // If projectId not in path, try to extract from body for POST/PUT/PATCH requests
    if (!projectId && allowProjectIdFromBody && ['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
      try {
        const body = await c.req.json();
        if (body && typeof body.projectId === 'string') {
          projectId = body.projectId;
          logger.debug({ projectId }, 'Extracted projectId from request body');
        }
      } catch {
        logger.debug({}, 'Could not extract projectId from body');
      }
    }

    if (!tenantId) {
      throw createApiError({
        code: 'bad_request',
        message: 'Missing tenantId',
      });
    }

    if (process.env.ENVIRONMENT === 'test') {
      const defaultBranchName = projectId
        ? getProjectScopedRef(tenantId, projectId, 'main')
        : getTenantScopedRef(tenantId, 'main');
      const defaultRef: ResolvedRef = {
        type: 'branch',
        name: defaultBranchName,
        hash: 'test-hash',
      };
      c.set('resolvedRef', defaultRef);
      await next();
      return;
    }

    if (pathSplit.length < 4 && ref !== 'main' && ref !== undefined) {
      throw createApiError({
        code: 'bad_request',
        message: 'Ref is not supported for this path',
      });
    }

    let resolvedRef: ResolvedRef;

    if (projectId) {
      resolvedRef = await resolveProjectRef(db, c, tenantId, projectId, ref);
    } else {
      resolvedRef = await resolveTenantRef(db, tenantId, ref);
    }

    // SigNoz routes are noisy, so we log at debug level
    if (c.req.path.includes('/signoz/')) {
      logger.debug({ resolvedRef, projectId, tenantId }, 'Resolved ref');
    } else {
      logger.info({ resolvedRef, projectId, tenantId }, 'Resolved ref');
    }

    c.set('resolvedRef', resolvedRef);

    await next();
  };
};

/**
 * Resolve ref for project-scoped requests
 */
async function resolveProjectRef(
  db: AgentsManageDatabaseClient,
  c: Context,
  tenantId: string,
  projectId: string,
  ref: string | undefined
): Promise<ResolvedRef> {
  const projectMain = getProjectScopedRef(tenantId, projectId, 'main');
  const projectScopedRef = ref ? getProjectScopedRef(tenantId, projectId, ref) : projectMain;

  if (ref && ref !== 'main') {
    let refResult = await resolveRef(db)(projectScopedRef);

    if (!refResult) {
      refResult = await resolveRef(db)(ref);
    }

    if (!refResult) {
      throw createApiError({
        code: 'not_found',
        message: `Unknown ref: ${ref}`,
      });
    }
    return refResult;
  }

  let refResult: Awaited<ReturnType<ReturnType<typeof resolveRef>>> = null;
  try {
    refResult = await resolveRef(db)(projectMain);
  } catch (error) {
    logger.warn({ error, projectMain }, 'Failed to resolve project main branch');
    refResult = null;
  }

  if (!refResult) {
    const method = c.req.method;
    if (method === 'PUT') {
      const tenantMain = `${tenantId}_main`;
      let tenantRefResult = await resolveRef(db)(tenantMain);
      if (!tenantRefResult) {
        await ensureBranchExists(db, tenantMain);
        tenantRefResult = await resolveRef(db)(tenantMain);
      }
      if (tenantRefResult) {
        return tenantRefResult;
      }
      throw createApiError({
        code: 'internal_server_error',
        message: `Failed to create tenant main branch for upsert`,
      });
    }
    throw createApiError({
      code: 'not_found',
      message: `Project not found: ${projectId}`,
    });
  }

  return refResult;
}

/**
 * Resolve ref for tenant-level requests
 */
async function resolveTenantRef(
  db: AgentsManageDatabaseClient,
  tenantId: string,
  ref: string | undefined
): Promise<ResolvedRef> {
  const tenantMain = `${tenantId}_main`;

  if (ref && ref !== 'main') {
    const tenantScopedRef = `${tenantId}_${ref}`;
    let refResult = await resolveRef(db)(tenantScopedRef);

    if (!refResult) {
      refResult = await resolveRef(db)(ref);
    }

    if (!refResult) {
      throw createApiError({
        code: 'not_found',
        message: `Unknown ref: ${ref}`,
      });
    }
    return refResult;
  }

  let refResult = await resolveRef(db)(tenantMain);

  if (!refResult) {
    await ensureBranchExists(db, tenantMain);
    refResult = await resolveRef(db)(tenantMain);

    if (!refResult) {
      throw createApiError({
        code: 'internal_server_error',
        message: `Failed to create tenant main branch: ${tenantMain}`,
      });
    }
  }

  return refResult;
}

export const writeProtectionMiddleware = async (c: Context, next: Next) => {
  if (process.env.ENVIRONMENT === 'test') {
    await next();
    return;
  }

  const resolvedRef = c.get('resolvedRef') as ResolvedRef | undefined;

  if (!resolvedRef) {
    await next();
    return;
  }

  const method = c.req.method;
  const isWriteOperation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  if (isWriteOperation && !isRefWritable(resolvedRef)) {
    throw createApiError({
      code: 'bad_request',
      message: `Cannot perform write operation on ${resolvedRef.type}. Tags and commits are immutable. Write to a branch instead.`,
    });
  }

  await next();
};

export const manageRefMiddleware = createRefMiddleware(manageDbClient);
export const runRefMiddleware = createRefMiddleware(manageDbClient, {
  extractTenantId: extractTenantIdFromExecutionContext,
  extractProjectId: extractProjectIdFromExecutionContext,
  allowProjectIdFromBody: false,
});
