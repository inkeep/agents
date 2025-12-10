/**
 * Helper function to enforce projectId filter on SigNoz queries.
 * This modifies the query payload to ensure all builder queries include
 * a server-side project.id filter, preventing client-side filter bypass.
 */
export function enforceProjectFilter(payload: any, projectId: string): any {
  const modifiedPayload = JSON.parse(JSON.stringify(payload));

  if (modifiedPayload.compositeQuery?.builderQueries) {
    for (const queryKey in modifiedPayload.compositeQuery.builderQueries) {
      const query = modifiedPayload.compositeQuery.builderQueries[queryKey];

      if (!query.filters) {
        query.filters = { op: 'AND', items: [] };
      }

      // Remove any existing project.id filters to prevent bypass
      query.filters.items = query.filters.items.filter(
        (item: any) => item.key?.key !== 'project.id'
      );

      // Add server-side project filter
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

  return modifiedPayload;
}

