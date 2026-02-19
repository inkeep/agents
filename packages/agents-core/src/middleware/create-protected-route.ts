// biome-ignore lint/style/noRestrictedImports: this IS the createProtectedRoute implementation
import type { createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { ZodType } from 'zod';
import { getAuthzMeta, type ProjectScopedMiddleware } from './authz-meta';

type CreateRouteParams = Parameters<typeof createRoute>[0];

function toArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function createProtectedRoute<T extends CreateRouteParams>(
  config: T & {
    permission: ProjectScopedMiddleware;
    request: { params: ZodType<{ projectId: string }> };
  }
): T;
export function createProtectedRoute<T extends CreateRouteParams>(
  config: T & {
    permission: ProjectScopedMiddleware;
    request: { params: ZodType<{ id: string }> };
  }
): T;
export function createProtectedRoute<T extends CreateRouteParams>(
  config: T & { permission: MiddlewareHandler & { __projectScoped?: never } }
): T;
export function createProtectedRoute<T extends CreateRouteParams>(
  config: T & { permission: MiddlewareHandler }
): T {
  const { permission, ...routeConfig } = config;
  const meta = getAuthzMeta(permission);

  return {
    ...routeConfig,
    middleware: [permission, ...toArray(routeConfig.middleware)],
    ...(meta && { 'x-authz': meta }),
    ...(!meta && !('security' in config) && { security: [] }),
  } as unknown as T;
}
