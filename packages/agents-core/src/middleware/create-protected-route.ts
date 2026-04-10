// biome-ignore lint/style/noRestrictedImports: this IS the createProtectedRoute implementation
import type { createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { ZodType } from 'zod';
import { getAuthzMeta, type ProjectScopedMiddleware } from './authz-meta';
import { getEntitlementMeta } from './entitlement-meta';

type CreateRouteParams = Parameters<typeof createRoute>[0];

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function createProtectedRoute<T extends CreateRouteParams>(
  config: T & {
    permission: ProjectScopedMiddleware<any>;
    entitlement?: MiddlewareHandler;
    request: { params: ZodType<{ projectId: string }> };
  }
): T;
export function createProtectedRoute<T extends CreateRouteParams>(
  config: T & {
    permission: ProjectScopedMiddleware<any>;
    entitlement?: MiddlewareHandler;
    request: { params: ZodType<{ id: string }> };
  }
): T;
export function createProtectedRoute<T extends CreateRouteParams>(
  config: T & {
    permission: MiddlewareHandler & { __projectScoped?: never };
    entitlement?: MiddlewareHandler;
  }
): T;
export function createProtectedRoute<T extends CreateRouteParams>(
  config: T & { permission: MiddlewareHandler; entitlement?: MiddlewareHandler }
): T {
  const { permission, entitlement, ...routeConfig } = config;
  const meta = getAuthzMeta(permission);
  const entitlementMetaValue = entitlement ? getEntitlementMeta(entitlement) : undefined;

  const middlewares = [permission, ...toArray(routeConfig.middleware)];
  if (entitlement) {
    middlewares.push(entitlement);
  }

  return {
    ...routeConfig,
    middleware: middlewares,
    ...(meta && { 'x-authz': meta }),
    ...(entitlementMetaValue && { 'x-entitlement': entitlementMetaValue }),
    ...(!meta && !('security' in config) && { security: [] }),
  } as unknown as T;
}
