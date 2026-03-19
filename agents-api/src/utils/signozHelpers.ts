const ALLOWED_SERVICE_NAMES = ['inkeep-agents-api', 'inkeep-agents-run-api'];

/**
 * Enforces server-side filters on SigNoz builder queries.
 * Scopes to known Inkeep services and prevents tenant/project filter bypass.
 */
export function enforceSecurityFilters(payload: any, tenantId: string, projectId?: string): any {
  const modifiedPayload = JSON.parse(JSON.stringify(payload));

  if (modifiedPayload.compositeQuery?.builderQueries) {
    for (const queryKey in modifiedPayload.compositeQuery.builderQueries) {
      const query = modifiedPayload.compositeQuery.builderQueries[queryKey];

      if (!query.filters) {
        query.filters = { op: 'AND', items: [] };
      }

      // Remove any existing tenant.id and project.id filters to prevent bypass
      query.filters.items = query.filters.items.filter(
        (item: any) =>
          item.key?.key !== 'serviceName' &&
          item.key?.key !== 'tenant.id' &&
          item.key?.key !== 'project.id'
      );

      query.filters.items.push(
        {
          key: {
            key: 'serviceName',
            dataType: 'string',
            type: 'resource',
            isColumn: true,
            isJSON: false,
          },
          op: 'in',
          value: ALLOWED_SERVICE_NAMES,
        },
        {
          key: {
            key: 'tenant.id',
            dataType: 'string',
            type: 'tag',
            isColumn: false,
            isJSON: false,
            id: 'false',
          },
          op: '=',
          value: tenantId,
        }
      );

      // Add server-side project filter if provided
      if (projectId) {
        query.filters.items.push({
          key: {
            key: 'project.id',
            dataType: 'string',
            type: 'tag',
            isColumn: false,
            isJSON: false,
            id: 'false',
          },
          op: '=',
          value: projectId,
        });
      }
    }
  }

  return modifiedPayload;
}
