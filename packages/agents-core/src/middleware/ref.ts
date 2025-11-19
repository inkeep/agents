import {
  createApiError,
  type DatabaseClient,
  doltBranch,
  getMetadataFromApiKey,
  isRefWritable,
  type ResolvedRef,
  resolveRef,
} from '@inkeep/agents-core';
import type { Context, Next } from 'hono';
import { getLogger } from '../utils/logger';

const logger = getLogger('ref');

export type RefContext = {
  resolvedRef?: ResolvedRef;
};

export const refMiddleware = (
  dbClient: DatabaseClient,
  options?: { apiType?: 'manage' | 'run' }
) => {
  return async (c: Context, next: Next) => {
    if (process.env.ENVIRONMENT === 'test') {
      await next();
      return;
    }

    const ref = c.req.query('ref');
    const path = c.req.path;
    const pathSplit = path.split('/');
    const apiType = options?.apiType;

    let tenantId: string | undefined;
    let projectId: string | undefined;

    if (apiType === 'run') {
      if (c.req.header('x-inkeep-tenant-id')) {
        tenantId = c.req.header('x-inkeep-tenant-id');
      }
      if (c.req.header('x-inkeep-project-id')) {
        projectId = c.req.header('x-inkeep-project-id');
      }
      if (!tenantId || (!projectId && c.req.header('Authorization'))) {
        const metadata = getMetadataFromApiKey(c.req.header('Authorization')?.split(' ')[1] || '');
        if (!metadata) {
          throw createApiError({
            code: 'bad_request',
            message: 'Missing tenantId or projectId',
          });
        }
        tenantId = metadata.tenantId;
        projectId = metadata.projectId;
      }
      if (!tenantId || !projectId) {
        throw createApiError({
          code: 'bad_request',
          message: 'Missing tenantId or projectId',
        });
      }
    } else {
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
      if (!tenantId && apiType === 'manage') {
        tenantId = pathSplit[2];
      }
      if (!projectId && apiType === 'manage' && pathSplit.length >= 5) {
        projectId = pathSplit[4];
      }

      if (!tenantId) {
        throw createApiError({
          code: 'bad_request',
          message: 'Missing tenantId',
        });
      }
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
