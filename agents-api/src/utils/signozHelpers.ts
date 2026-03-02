/**
 * Enforce tenant/project security on ClickHouse SQL queries by:
 * 1. Injecting server-side variables (tenant_id, project_id) — always overrides client values
 * 2. Validating every chQuery references {{.tenant_id}} to prevent tenant isolation bypass
 *
 * Returns null if valid, or an error message string if a query is missing the tenant filter.
 */
export function enforceQuerySecurity(
  payload: any,
  tenantId: string,
  projectId?: string
): { payload: any; error?: string } {
  const modifiedPayload = JSON.parse(JSON.stringify(payload));
  if (!modifiedPayload.variables) {
    modifiedPayload.variables = {};
  }
  modifiedPayload.variables.tenant_id = tenantId;
  if (projectId) {
    modifiedPayload.variables.project_id = projectId;
  }

  const chQueries = modifiedPayload.compositeQuery?.chQueries;
  if (chQueries) {
    for (const [name, entry] of Object.entries(chQueries)) {
      const query = (entry as any)?.query;
      if (typeof query === 'string' && !query.includes('{{.tenant_id}}')) {
        return {
          payload: modifiedPayload,
          error: `Query "${name}" is missing required {{.tenant_id}} tenant filter`,
        };
      }
    }
  }

  return { payload: modifiedPayload };
}
