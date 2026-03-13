import type { OpenAPIHono, RouteConfig, RouteHandler } from '@hono/zod-openapi';
import { createProtectedRoute } from '@inkeep/agents-core/middleware';
import type { ManageAppVariables } from '../types/app';

type ManageEnv = { Variables: ManageAppVariables };

/**
 * Utility type for typing extracted route handlers that are shared between
 * PUT and PATCH registrations. Provides type safety for `c.req.valid('param')`,
 * `c.req.valid('json')`, and `c.get('db')` etc.
 *
 * Usage:
 * ```ts
 * const handler: ManageRouteHandler<typeof myRouteConfig> = async (c) => {
 *   const { tenantId } = c.req.valid('param'); // typed
 *   const body = c.req.valid('json');           // typed
 *   const db = c.get('db');                     // typed
 * };
 * ```
 */
export type ManageRouteHandler<C extends Omit<RouteConfig, 'method'>> = RouteHandler<
  C & { method: 'patch' },
  ManageEnv
>;

/**
 * Registers both a canonical and a legacy HTTP method for the same route handler.
 * The legacy method gets `x-speakeasy-ignore: true` and a suffixed operationId,
 * making it easy to track and remove legacy methods in the future.
 *
 * Standard CRUD routes: PATCH canonical (default), PUT legacy (suffix: `-put`)
 * Upsert/set-replace routes: PUT canonical, PATCH legacy (suffix: `-patch`)
 *
 * @param canonical - 'patch' (default) for standard CRUD updates, 'put' for upsert/set-replace routes
 */
export function openapiRegisterPutPatchRoutesForLegacy<H extends (...args: any[]) => any>(
  app: OpenAPIHono<ManageEnv>,
  config: Record<string, unknown>,
  handler: H,
  options: {
    operationId: string;
    canonical?: 'patch' | 'put';
  }
): void {
  const { operationId, canonical = 'patch' } = options;
  const legacy = canonical === 'patch' ? 'put' : 'patch';

  app.openapi(
    createProtectedRoute({
      ...config,
      method: canonical,
      operationId,
    } as any),
    handler as any
  );

  app.openapi(
    createProtectedRoute({
      ...config,
      method: legacy,
      operationId: `${operationId}-${legacy}`,
      'x-speakeasy-ignore': true,
    } as any),
    handler as any
  );
}
