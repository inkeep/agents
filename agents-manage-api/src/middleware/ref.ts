import {
  createApiError,
  doltBranch,
  isRefWritable,
  type ResolvedRef,
  resolveRef,
} from '@inkeep/agents-core';
import type { Context, Next } from 'hono';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('ref');

export type RefContext = {
  resolvedRef?: ResolvedRef;
};

export const refMiddleware = async (c: Context, next: Next) => {
  if (process.env.ENVIRONMENT === 'test') {
    await next();
    return;
  }

  const ref = c.req.query('ref');
  const path = c.req.path;

  // Extract tenantId from /tenants/:tenantId/... path structure
  // For /tenants/123/projects, split('/') = ['', 'tenants', '123', 'projects']
  // tenantId is at index 2
  const tenantId = path.split('/')[2];

  if (!tenantId) {
    throw createApiError({
      code: 'bad_request',
      message: 'Missing tenantId in path',
    });
  }

  const tenant_main = `${tenantId}_main`;

  let resolvedRef: ResolvedRef;

  if (ref) {
    // User provided a specific ref
    const refResult = await resolveRef(dbClient)(ref);
    if (!refResult) {
      throw createApiError({
        code: 'not_found',
        message: `Unknown ref: ${ref}`,
      });
    }
    resolvedRef = refResult;
  } else {
    // No ref provided, use tenant main
    let refResult = await resolveRef(dbClient)(tenant_main);

    if (!refResult) {
      // Tenant main doesn't exist, create it
      await doltBranch(dbClient)({ name: tenant_main });

      // Resolve the newly created branch
      refResult = await resolveRef(dbClient)(tenant_main);

      if (!refResult) {
        throw createApiError({
          code: 'internal_server_error',
          message: `Failed to create tenant main branch: ${tenant_main}`,
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
