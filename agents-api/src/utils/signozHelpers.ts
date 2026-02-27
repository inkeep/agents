/**
 * Helper function to enforce tenant/project filters on SigNoz v5 queries.
 * Appends server-side tenant.id (and optionally project.id) clauses to every
 * builder_query's filter expression, preventing client-side filter bypass.
 */
export function enforceSecurityFilters(payload: any, tenantId: string, projectId?: string): any {
  const modifiedPayload = JSON.parse(JSON.stringify(payload));
  const queries: any[] | undefined = modifiedPayload.compositeQuery?.queries;
  if (!Array.isArray(queries)) return modifiedPayload;

  for (const envelope of queries) {
    if (envelope.type !== 'builder_query') continue;
    const spec = envelope.spec;
    if (!spec) continue;

    const securityClauses: string[] = [];

    // Strip any existing tenant.id / project.id from the expression to prevent bypass
    let expr: string = spec.filter?.expression ?? '';
    expr = expr
      .replace(/\s*AND\s+tenant\.id\s*=\s*'[^']*'/gi, '')
      .replace(/\s*AND\s+project\.id\s*=\s*'[^']*'/gi, '')
      .replace(/^tenant\.id\s*=\s*'[^']*'\s*AND\s*/i, '')
      .replace(/^project\.id\s*=\s*'[^']*'\s*AND\s*/i, '')
      .trim();

    securityClauses.push(`tenant.id = '${tenantId}'`);
    if (projectId) {
      securityClauses.push(`project.id = '${projectId}'`);
    }

    const securityExpr = securityClauses.join(' AND ');
    spec.filter = {
      expression: expr ? `${securityExpr} AND ${expr}` : securityExpr,
    };
  }

  return modifiedPayload;
}
