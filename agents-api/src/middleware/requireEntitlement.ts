import { createApiError, withEntitlementLock } from '@inkeep/agents-core';
import { registerEntitlementMeta } from '@inkeep/agents-core/middleware';
import { createMiddleware } from 'hono/factory';
import { HTTPException } from 'hono/http-exception';
import runDbClient from '../data/db/runDbClient';
import type { ManageAppVariables } from '../types/app';

type EntitlementConfig = {
  resourceType: string;
  countFn: (tenantId: string) => Promise<number>;
  label?: string;
};

export const requireEntitlement = <
  Env extends { Variables: ManageAppVariables } = { Variables: ManageAppVariables },
>(
  config: EntitlementConfig
) => {
  const { resourceType, countFn, label } = config;
  const displayLabel = label ?? resourceType;

  const mw = createMiddleware<Env>(async (c, next) => {
    const tenantId = c.get('tenantId');

    if (!tenantId) {
      await next();
      return;
    }

    try {
      await withEntitlementLock(runDbClient, tenantId, resourceType, async (limit, _tx) => {
        if (limit === null) {
          await next();
          return;
        }

        const current = await countFn(tenantId);

        if (current >= limit) {
          throw createApiError({
            code: 'payment_required',
            message: `${displayLabel} limit reached (${current}/${limit})`,
            instance: c.req.path,
            extensions: {
              resourceType,
              current,
              limit,
            },
          });
        }

        await next();
      });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      throw createApiError({
        code: 'internal_server_error',
        message: 'Failed to verify entitlement',
        instance: c.req.path,
        extensions: {
          resourceType,
          internalError: errorMessage,
        },
      });
    }
  });

  registerEntitlementMeta(mw, {
    resourceType,
    description: `Subject to ${resourceType} limit when configured for the organization`,
  });

  return mw;
};
