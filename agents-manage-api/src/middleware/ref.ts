import {
  createApiError,
  doltBranch,
  isRefWritable,
  type ResolvedRef,
  resolveRef,
  getLogger
} from '@inkeep/agents-core';
import dbClient from '../data/db/dbClient';
import type { Context, Next } from 'hono';

const logger = getLogger('ref');

export type RefContext = {
  resolvedRef?: ResolvedRef;
};

export const refMiddleware = async (c: Context, next: Next) => {
  if (process.env.ENVIRONMENT === 'test') {
    // Set a default resolvedRef for test mode
    // Extract tenantId from path for test default
    const path = c.req.path;
    const pathSplit = path.split('/');
    const tenantId = pathSplit[2];
    const defaultRef: ResolvedRef = {
      type: 'branch',
      name: tenantId ? `${tenantId}_main` : 'main',
      hash: 'test-hash',
    };
    c.set('resolvedRef', defaultRef);
    await next();
    return;
  }

  const ref = c.req.query('ref');
  const path = c.req.path;
  const pathSplit = path.split('/');


  let tenantId: string | undefined;
  let projectId: string | undefined;

    if (pathSplit.length < 4 && ref !== 'main' && ref !== undefined) {
      throw createApiError({
        code: 'bad_request',
        message: 'Ref is not supported for this path',
      });
    }
    // Extract tenantId from /tenants/:tenantId/... path structure (only for agents-manage-api routes)
    // For /tenants/123/projects, split('/') = ['', 'tenants', '123', 'projects']
    // tenantId is at index 2, projectId is at index 4
    // Only use path-based extraction if path matches the expected pattern
    if (!tenantId) {
      tenantId = pathSplit[2];
    }
    if (!projectId && pathSplit.length >= 5) {
      projectId = pathSplit[4];
    }

    if (!tenantId) {
      throw createApiError({
        code: 'bad_request',
        message: 'Missing tenantId',
      });
    }
  

  const tenantMain = `${tenantId}_main`;
  const projectScopedRef = `${tenantId}_${projectId}_${ref}`;

  let resolvedRef: ResolvedRef;

  if (ref && ref !== 'main') {
    // User provided a specific ref
    // First try to resolve as project-scoped ref (e.g., tenant_project_branch)
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
    // No ref provided, use tenant main
    let refResult = await resolveRef(dbClient)(tenantMain);

    if (!refResult) {
      // Tenant main doesn't exist, create it
      await doltBranch(dbClient)({ name: tenantMain });

      // Resolve the newly created branch
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

  logger.info({ resolvedRef }, 'Resolved ref');

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
