import { createMiddleware } from 'hono/factory';
import { registerAuthzMeta } from './authz-meta';

/**
 * Documentation-only permission marker for routes whose authentication
 * is already enforced by a parent `app.use()` in createApp.ts.
 *
 * This does NOT perform any auth check itself — it only registers
 * x-authz metadata so the OpenAPI spec accurately reflects the
 * auth requirement.
 *
 * Use this when the route lives under a path that already has
 * middleware applied (e.g. `/manage/tenants/*` has `manageApiKeyOrSessionAuth`).
 */
export const inheritedAuth = (meta: {
  resource?: string;
  permission?: string;
  description: string;
}) => {
  const mw = createMiddleware(async (_c, next) => {
    await next();
  });
  registerAuthzMeta(mw, meta);
  return mw;
};

/**
 * Marker for routes under `/manage/tenants/*` whose auth is handled
 * by `manageApiKeyOrSessionAuth()` in createApp.ts.
 *
 * No auth check runs at the route level — this is purely for OpenAPI documentation.
 */
export const inheritedManageTenantAuth = () =>
  inheritedAuth({
    resource: 'organization',
    permission: 'member',
    description:
      'Requires organization membership. Auth is enforced by the manageApiKeyOrSessionAuth middleware in createApp.ts.',
  });

/**
 * Marker for routes under `/run/*` whose auth is handled
 * by `runApiKeyAuth()` in createApp.ts.
 *
 * No auth check runs at the route level — this is purely for OpenAPI documentation.
 */
export const inheritedRunApiKeyAuth = () =>
  inheritedAuth({
    description:
      'Requires a valid API key (Bearer token). Auth is enforced by runApiKeyAuth middleware in createApp.ts.',
  });

/**
 * Marker for routes under `/work-apps/*` whose auth is handled
 * by `workAppsAuth()` in createApp.ts.
 *
 * No auth check runs at the route level — this is purely for OpenAPI documentation.
 */
export const inheritedWorkAppsAuth = () =>
  inheritedAuth({
    description:
      'Requires work-apps authentication (OIDC token or Slack signature). Auth is enforced by workAppsAuth middleware in createApp.ts.',
  });
