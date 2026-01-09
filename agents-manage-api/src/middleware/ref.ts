import {
  createApiError,
  doltBranch,
  getLogger,
  isRefWritable,
  type ResolvedRef,
  resolveRef,
} from '@inkeep/agents-core';
import type { Context, Next } from 'hono';
import manageDbClient from '../data/db/dbClient';

const logger = getLogger('ref');

/**
 * Create a branch if it doesn't exist, handling race conditions gracefully.
 * If multiple concurrent requests try to create the same branch, only one will succeed.
 * Others may fail with various errors (XX000 internal error, duplicate key, etc.)
 * Instead of checking error messages, we verify the desired end state: branch exists.
 */
const ensureBranchExists = async (branchName: string): Promise<void> => {
  // First, check if branch already exists to avoid unnecessary errors
  const existingBranch = await resolveRef(manageDbClient)(branchName);
  if (existingBranch) {
    logger.debug({ branchName }, 'Branch already exists, skipping creation');
    return;
  }

  // Try to create the branch
  try {
    await doltBranch(manageDbClient)({ name: branchName });
    logger.debug({ branchName }, 'Branch created successfully');
  } catch (error) {
    // Branch creation failed - this could be due to a race condition where
    // another concurrent request created it between our check and create.
    // Verify if the branch now exists.
    const branchNowExists = await resolveRef(manageDbClient)(branchName);
    if (branchNowExists) {
      logger.debug(
        { branchName },
        'Branch creation failed but branch exists (concurrent creation), continuing'
      );
      return;
    }

    // Branch still doesn't exist - this is a real error
    logger.error({ branchName, error }, 'Branch creation failed and branch does not exist');
    throw error;
  }
};

export type RefContext = {
  resolvedRef?: ResolvedRef;
};

export const refMiddleware = async (c: Context, next: Next) => {
  const ref = c.req.query('ref');
  const path = c.req.path;
  const pathSplit = path.split('/');

  let tenantId: string | undefined;
  let projectId: string | undefined;

  // Use regex to extract tenantId and projectId if the path matches /tenants/{tenantId}/projects or /tenants/{tenantId}/projects/{projectId} or similar
  // Example: /tenants/123/projects or /tenants/123/projects/456
  const tenantPathRegex = /^\/tenants\/([^/]+)/;
  const tenantPathMatch = path.match(tenantPathRegex);
  if (tenantPathMatch) {
    tenantId = tenantPathMatch[1];
  }

  // Match /tenants/{tenantId}/projects/{projectId} OR /tenants/{tenantId}/project-full/{projectId}
  const projectPathRegex = /^\/tenants\/[^/]+\/(?:projects|project-full)(?:\/([^/]+))?/;
  const projectPathMatch = path.match(projectPathRegex);
  if (projectPathMatch) {
    projectId = projectPathMatch[1];
  }

  // If projectId not in path, try to extract from body for POST/PUT/PATCH requests
  // This handles endpoints like /playground/token that pass projectId in the body
  if (!projectId && ['POST', 'PUT', 'PATCH'].includes(c.req.method)) {
    try {
      // Hono caches the parsed body, so this is safe to call in middleware
      // and again in the route handler via c.req.json() or c.req.valid('json')
      const body = await c.req.json();
      if (body && typeof body.projectId === 'string') {
        projectId = body.projectId;
        logger.debug({ projectId }, 'Extracted projectId from request body');
      }
    } catch {
      // Body parsing failed or no body - continue without projectId
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
    // Set a default resolvedRef for test mode using project-scoped branch if available
    const defaultBranchName = projectId ? `${tenantId}_${projectId}_main` : `${tenantId}_main`;
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
    // Project-scoped branch resolution
    const projectMain = `${tenantId}_${projectId}_main`;
    const projectScopedRef = `${tenantId}_${projectId}_${ref}`;

    if (ref && ref !== 'main') {
      // User provided a specific ref - try project-scoped first
      let refResult = await resolveRef(manageDbClient)(projectScopedRef);

      // If project-scoped ref not found, try resolving the ref directly
      // This handles tags and commit hashes which aren't namespaced
      if (!refResult) {
        refResult = await resolveRef(manageDbClient)(ref);
      }

      if (!refResult) {
        throw createApiError({
          code: 'not_found',
          message: `Unknown ref: ${ref}`,
        });
      }
      resolvedRef = refResult;
    } else {
      // No ref provided, use project main
      let refResult: Awaited<ReturnType<ReturnType<typeof resolveRef>>> = null;
      try {
        refResult = await resolveRef(manageDbClient)(projectMain);
      } catch (error) {
        // If resolveRef fails (e.g., database connection issue), treat as project not found
        logger.warn({ error, projectMain }, 'Failed to resolve project main branch');
        refResult = null;
      }

      if (!refResult) {
        // Project main doesn't exist - the project doesn't exist
        // For PUT requests (upsert behavior), fall back to tenant_main to allow project creation
        // For GET/DELETE, return 404
        const method = c.req.method;
        if (method === 'PUT') {
          // Fall back to tenant_main for upsert - let the route handler create the project
          const tenantMain = `${tenantId}_main`;
          let tenantRefResult = await resolveRef(manageDbClient)(tenantMain);
          if (!tenantRefResult) {
            // Create tenant main if it doesn't exist (handles concurrent creation gracefully)
            await ensureBranchExists(tenantMain);
            tenantRefResult = await resolveRef(manageDbClient)(tenantMain);
          }
          if (tenantRefResult) {
            resolvedRef = tenantRefResult;
          } else {
            throw createApiError({
              code: 'internal_server_error',
              message: `Failed to create tenant main branch for upsert`,
            });
          }
        } else {
          // For GET, DELETE, etc. - project doesn't exist
          throw createApiError({
            code: 'not_found',
            message: `Project not found: ${projectId}`,
          });
        }
      } else {
        resolvedRef = refResult;
      }
    }
  } else {
    // Tenant-level branch resolution (for /projects endpoint, etc.)
    const tenantMain = `${tenantId}_main`;

    if (ref && ref !== 'main') {
      // For tenant-level routes, only allow tenant-scoped refs or direct refs
      const tenantScopedRef = `${tenantId}_${ref}`;
      let refResult = await resolveRef(manageDbClient)(tenantScopedRef);

      if (!refResult) {
        refResult = await resolveRef(manageDbClient)(ref);
      }

      if (!refResult) {
        throw createApiError({
          code: 'not_found',
          message: `Unknown ref: ${ref}`,
        });
      }
      resolvedRef = refResult;
    } else {
      // No ref provided, use tenant main
      let refResult = await resolveRef(manageDbClient)(tenantMain);

      if (!refResult) {
        // Tenant main doesn't exist, create it (handles concurrent creation gracefully)
        await ensureBranchExists(tenantMain);

        refResult = await resolveRef(manageDbClient)(tenantMain);

        if (!refResult) {
          throw createApiError({
            code: 'internal_server_error',
            message: `Failed to create tenant main branch: ${tenantMain}`,
          });
        }
      }

      resolvedRef = refResult;
    }
  }

  logger.info({ resolvedRef, projectId, tenantId }, 'Resolved ref');

  c.set('resolvedRef', resolvedRef);

  await next();
};

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
