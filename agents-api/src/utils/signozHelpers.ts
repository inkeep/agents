/**
 * Enforce tenant/project security on ClickHouse SQL queries by injecting
 * server-side variables. SQL queries use {{.tenant_id}} / {{.project_id}}
 * via SigNoz variable substitution, preventing SQL injection.
 *
 * Always overrides client-provided values to prevent spoofing.
 */
export function enforceQuerySecurity(payload: any, tenantId: string, projectId?: string): any {
  const modifiedPayload = JSON.parse(JSON.stringify(payload));
  if (!modifiedPayload.variables) {
    modifiedPayload.variables = {};
  }
  modifiedPayload.variables.tenant_id = tenantId;
  if (projectId) {
    modifiedPayload.variables.project_id = projectId;
  }
  return modifiedPayload;
}
