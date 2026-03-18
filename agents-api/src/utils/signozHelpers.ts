const SERVICE_NAME_FILTER = "serviceName IN ('inkeep-agents-api', 'inkeep-agents-run-api')";

export function esc(value: string): string {
  return value.replace(/'/g, "''");
}

function buildSecurityExpression(tenantId: string, projectId?: string): string {
  let expr = `${SERVICE_NAME_FILTER} AND tenant.id = '${esc(tenantId)}'`;
  if (projectId) expr += ` AND project.id = '${esc(projectId)}'`;
  return expr;
}

/**
 * Enforces server-side filters on SigNoz v5 builder queries.
 * Scopes to known Inkeep services and prevents tenant/project filter bypass.
 */
export function enforceSecurityFilters(payload: any, tenantId: string, projectId?: string): any {
  if (payload.compositeQuery?.queries) {
    const securityExpr = buildSecurityExpression(tenantId, projectId);
    for (const { type, spec } of payload.compositeQuery.queries) {
      if (type !== 'builder_query') continue;
      spec.filter = { expression: `(${spec.filter.expression}) AND ${securityExpr}` };
    }
  }
  return payload;
}
