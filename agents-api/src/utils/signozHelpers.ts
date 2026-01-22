/**
 * Helper function to enforce projectId filter on SigNoz queries.
 * This modifies the query payload to ensure all builder queries include
 * a server-side project.id filter, preventing client-side filter bypass.
 */
export function enforceSecurityFilters(
  payload: any,
  tenantId: string,
  projectId?: string
): any {
  const modifiedPayload = JSON.parse(JSON.stringify(payload));

  if (modifiedPayload.compositeQuery?.builderQueries) {
    for (const queryKey in modifiedPayload.compositeQuery.builderQueries) {
      const query = modifiedPayload.compositeQuery.builderQueries[queryKey];

      if (!query.filters) {
        query.filters = { op: 'AND', items: [] };
      }

      // Remove any existing tenant.id and project.id filters to prevent bypass
      query.filters.items = query.filters.items.filter(
        (item: any) => item.key?.key !== 'tenant.id' && item.key?.key !== 'project.id'
      );

      // Always add server-side tenant filter
      query.filters.items.push({
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
      });

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
