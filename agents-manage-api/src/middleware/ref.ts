import { createApiError, isRefWritable, type ResolvedRef, resolveRef } from '@inkeep/agents-core';
import type { Context, Next } from 'hono';
import dbClient from '../data/db/dbClient';
import { getLogger } from '../logger';

const logger = getLogger('ref');

export type RefContext = {
  resolvedRef?: ResolvedRef;
};

export const refMiddleware = async (c: Context, next: Next) => {
  const ref = c.req.query('ref');

  let resolvedRef: ResolvedRef = {
    type: 'branch',
    name: 'main',
    hash: 'main',
  };

  if (ref) {
    const refResult = await resolveRef(dbClient)(ref);
    if (!refResult) {
      throw createApiError({
        code: 'not_found',
        message: `Unknown ref: ${ref}`,
      });
    }
    resolvedRef = refResult;
  }

  logger.info({ resolvedRef }, 'Resolved ref');

  c.set('resolvedRef', resolvedRef);

  await next();
};

export const writeProtectionMiddleware = async (c: Context, next: Next) => {
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
