const ALLOWED_SERVICE_NAMES = ['inkeep-agents-api', 'inkeep-agents-run-api'];

const SECURITY_FIELD_PATTERNS = [/\bserviceName\s*(=|IN|NOT IN)/gi, /\btenant\.id\s*(=|IN|NOT IN)/gi, /\bproject\.id\s*(=|IN|NOT IN)/gi];

function stripSecurityFields(expression: string): string {
  const clauses = expression
    .split(/\s+AND\s+/i)
    .map((c) => c.trim())
    .filter((c) => {
      const lower = c.toLowerCase();
      return (
        !lower.startsWith('servicename') &&
        !lower.startsWith('tenant.id') &&
        !lower.startsWith('project.id')
      );
    });
  return clauses.join(' AND ');
}

/**
 * Enforces server-side filters on SigNoz builder queries (v5 format).
 * Scopes to known Inkeep services and prevents tenant/project filter bypass.
 */
export function enforceSecurityFilters(payload: any, tenantId: string, projectId?: string): any {
  const modifiedPayload = JSON.parse(JSON.stringify(payload));

  if (modifiedPayload.compositeQuery?.queries) {
    for (const envelope of modifiedPayload.compositeQuery.queries) {
      if (envelope.type !== 'builder_query' && envelope.type !== 'builder_trace_operator') {
        continue;
      }
      const spec = envelope.spec;

      const securityClauses = [
        `serviceName IN ('${ALLOWED_SERVICE_NAMES.join("', '")}')`,
        `tenant.id = '${tenantId}'`,
      ];
      if (projectId) {
        securityClauses.push(`project.id = '${projectId}'`);
      }
      const securityExpr = securityClauses.join(' AND ');

      const existingExpr: string = spec.filter?.expression ?? '';
      const sanitized = existingExpr ? stripSecurityFields(existingExpr) : '';

      spec.filter = {
        expression: sanitized ? `${sanitized} AND ${securityExpr}` : securityExpr,
      };
    }
  }

  return modifiedPayload;
}
