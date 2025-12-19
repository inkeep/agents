import {
  createApiError,
  doltBranch,
  isRefWritable,
  type ResolvedRef,
  resolveRef,
  getLogger,
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import type { Context, Next } from 'hono';

const logger = getLogger('ref');

export type RefContext = {
  resolvedRef?: ResolvedRef;
};

export const refMiddleware = async (c: Context, next: Next) => {
  const ref = c.req.query('ref');
  const path = c.req.path;
  const pathSplit = path.split('/');

  let tenantId: string | undefined;
  let projectId: string | undefined;

  // Extract tenantId from /tenants/:tenantId/... path structure
  // For /tenants/123/projects, split('/') = ['', 'tenants', '123', 'projects']
  // tenantId is at index 2, projectId is at index 4
  tenantId = pathSplit[2];

  // Try to extract projectId from URL path first
  if (pathSplit.length >= 5) {
    projectId = pathSplit[4];
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
    const defaultBranchName = projectId
      ? `${tenantId}_${projectId}_main`
      : `${tenantId}_main`;
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
      let refResult = await resolveRef(dbClient)(projectScopedRef);

      // If project-scoped ref not found, try resolving the ref directly
      // This handles tags and commit hashes which aren't namespaced
      if (!refResult) {
        refResult = await resolveRef(dbClient)(ref);
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
      let refResult = await resolveRef(dbClient)(projectMain);

      if (!refResult) {
        // Project main doesn't exist, create it
        await doltBranch(dbClient)({ name: projectMain });

        // Resolve the newly created branch
        refResult = await resolveRef(dbClient)(projectMain);

        if (!refResult) {
          throw createApiError({
            code: 'internal_server_error',
            message: `Failed to create project main branch: ${projectMain}`,
          });
        }
      }

      resolvedRef = refResult;
    }
  } else {
    // Tenant-level branch resolution (for /projects endpoint, etc.)
    const tenantMain = `${tenantId}_main`;

    if (ref && ref !== 'main') {
      // For tenant-level routes, only allow tenant-scoped refs or direct refs
      const tenantScopedRef = `${tenantId}_${ref}`;
      let refResult = await resolveRef(dbClient)(tenantScopedRef);

      if (!refResult) {
        refResult = await resolveRef(dbClient)(ref);
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
      let refResult = await resolveRef(dbClient)(tenantMain);

      if (!refResult) {
        // Tenant main doesn't exist, create it
        await doltBranch(dbClient)({ name: tenantMain });

        refResult = await resolveRef(dbClient)(tenantMain);

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
