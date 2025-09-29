/**
 * Generate a SigNoz Traces Explorer URL scoped to a conversation that has errors.
 * Keeps columns/pagination; strips non-essential builder fields.
 */
export function getSignozTracesExplorerUrl(conversationId: string): string {
  const compositeQuery = {
    queryType: 'builder',
    builder: {
      queryData: [
        {
          dataSource: 'traces',
          queryName: 'A',
          // count over matching traces/spans
          aggregateOperator: 'count',
          timeAggregation: 'rate',
          spaceAggregation: 'sum',
          filters: {
            op: 'AND',
            items: [
              {
                op: 'not in',
                key: { id: 'hasError', key: 'hasError', dataType: 'bool', type: 'tag' },
                value: false,
              },
              {
                op: 'in',
                key: {
                  id: 'conversation.id',
                  key: 'conversation.id',
                  dataType: 'string',
                  type: 'tag',
                },
                value: conversationId,
              },
            ],
          },
          expression: 'A',
        },
      ],
      queryFormulas: [],
      queryTraceOperator: [],
    },
    promql: [{ name: 'A', query: '', legend: '', disabled: false }],
    clickhouse_sql: [{ name: 'A', query: '', legend: '', disabled: false }],
  };

  const encodedCompositeQuery = encodeURIComponent(
    encodeURIComponent(JSON.stringify(compositeQuery))
  );
  const signozUrl = process.env.SIGNOZ_URL || 'http://localhost:3080';

  return `${signozUrl}/traces-explorer?compositeQuery=${encodedCompositeQuery}&relativeTime=1month`;
}
