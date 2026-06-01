/**
 * Routes mounted under `/manage/tenants/*` that never read or write the
 * version-controlled manage Doltgres DB through the request-scoped (branch
 * checked-out) connection. They keep the manage tenant/session auth that runs
 * ahead of this chain — only ref resolution, write-protection, and the
 * dedicated branch-scoped connection are skipped.
 *
 * Why this exists: `branchScopedDbMiddleware` pins one connection from a small
 * pool for an entire request and runs two DOLT_CHECKOUTs around it. A route
 * that never touches Doltgres (external proxy, runtime-Postgres read, SpiceDB,
 * or auth-provider call) holds that connection for nothing — and under load the
 * longest-held of these (the SigNoz proxy waiting on an external HTTP call)
 * starves the pool, producing "timeout exceeded when trying to connect".
 *
 * Maintenance (full checklist in the route-handler-authoring skill):
 * - ADD a route here only after confirming its handler never uses `c.get('db')`
 *   — it relies solely on an external service, `runDbClient`, SpiceDB, or auth.
 * - REMOVE a route the instant its handler starts using `c.get('db')`: exempt
 *   routes run with no ref resolved and no branch checked out, so a manage-DB
 *   read would hit the wrong branch and `c.get('db')` would be undefined.
 * - When in doubt, leave a route OUT: the cost of staying in is one wasted
 *   connection; the cost of wrongly exempting is a read against the wrong branch.
 */
export const MANAGE_BRANCH_SCOPED_DB_EXEMPT_ROUTES: ReadonlyArray<{
  name: string;
  reason: string;
  path: RegExp;
}> = [
  {
    name: 'signoz',
    reason: 'External SigNoz HTTP proxy',
    path: /^\/manage\/tenants\/[^/]+\/signoz(?:\/|$)/,
  },
  {
    name: 'github',
    reason: 'External GitHub API + runtime Postgres (runDbClient)',
    path: /^\/manage\/tenants\/[^/]+\/github(?:\/|$)/,
  },
  {
    name: 'entitlements',
    reason: 'Runtime Postgres (runDbClient)',
    path: /^\/manage\/tenants\/[^/]+\/entitlements(?:\/|$)/,
  },
  {
    // Must NOT match the tool-level `/projects/:p/tools/:t/github-access`,
    // which DOES use the branch-scoped db — the `[^/]+` for projectId stops at
    // the next slash, so a `/tools/...` segment in between fails the match.
    name: 'project-github-access',
    reason: 'Runtime Postgres (runDbClient)',
    path: /^\/manage\/tenants\/[^/]+\/projects\/[^/]+\/github-access(?:\/|$)/,
  },
  {
    name: 'feedback',
    reason: 'Runtime Postgres (runDbClient)',
    path: /^\/manage\/tenants\/[^/]+\/projects\/[^/]+\/feedback(?:\/|$)/,
  },
  {
    name: 'tenant-apps',
    reason: 'Runtime Postgres (runDbClient)',
    path: /^\/manage\/tenants\/[^/]+\/apps(?:\/|$)/,
  },
  {
    name: 'user-project-memberships',
    reason: 'SpiceDB',
    path: /^\/manage\/tenants\/[^/]+\/users\/[^/]+\/project-memberships(?:\/|$)/,
  },
  {
    name: 'password-reset-links',
    reason: 'Better Auth provider API',
    path: /^\/manage\/tenants\/[^/]+\/password-reset-links(?:\/|$)/,
  },
];

/**
 * True when a `/manage/tenants/*` request path belongs to a route that does not
 * need the branch-scoped manage Doltgres connection.
 */
export function isManageRouteExemptFromBranchScopedDb(path: string): boolean {
  return MANAGE_BRANCH_SCOPED_DB_EXEMPT_ROUTES.some((route) => route.path.test(path));
}
