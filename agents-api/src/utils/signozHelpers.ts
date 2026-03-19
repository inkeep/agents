import { QUERY_TYPES, SPAN_KEYS } from '@inkeep/agents-core';

const SERVICE_NAME_FILTER = "serviceName IN ('inkeep-agents-api', 'inkeep-agents-run-api', 'inkeep-agents')";

function buildSecurityExpression(tenantId: string, projectId?: string): string {
  let expr = `${SERVICE_NAME_FILTER} AND ${SPAN_KEYS.TENANT_ID} = '${tenantId}'`;
  if (projectId) expr += ` AND ${SPAN_KEYS.PROJECT_ID} = '${projectId}'`;
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
      if (type !== QUERY_TYPES.BUILDER_QUERY) continue;
      spec.filter = { expression: `(${spec.filter.expression}) AND ${securityExpr}` };
    }
  }
  return payload;
}
