import { ExternalLink } from '../ui/external-link';

const SIGNOZ_BASE = process.env.NEXT_PUBLIC_SIGNOZ_URL ?? 'http://localhost:3080';

function makeTracesUrl(conversationId: string, relativeTime = '2months') {
  const compositeQuery = {
    queryType: 'builder',
    builder: {
      queryData: [
        {
          dataSource: 'traces',
          queryName: 'A',
          aggregateOperator: 'noop',
          aggregateAttribute: {
            id: 'false',
            dataType: '',
            key: '',
            isColumn: false,
            type: '',
            isJSON: false,
          },
          timeAggregation: 'rate',
          spaceAggregation: 'sum',
          functions: [],
          filters: {
            op: 'AND',
            items: [
              {
                key: {
                  key: 'conversation.id',
                  dataType: 'string',
                  type: 'tag',
                  isColumn: false,
                  isJSON: false,
                  id: 'false',
                },
                op: '=',
                value: conversationId,
              },
            ],
          },
          expression: 'A',
          disabled: false,
          stepInterval: 60,
          having: [],
          limit: null,
          orderBy: [{ columnName: 'timestamp', order: 'desc' }],
          groupBy: [],
          legend: '',
          reduceTo: 'avg',
        },
      ],
      queryFormulas: [],
      promql: [{ name: 'A', query: '', legend: '', disabled: false }],
      clickhouse_sql: [{ name: 'A', legend: '', disabled: false, query: '' }],
    },
  };

  const options = {
    selectColumns: [
      {
        key: 'serviceName',
        dataType: 'string',
        type: 'tag',
        isColumn: true,
        isJSON: false,
        id: 'serviceName--string--tag--true',
        isIndexed: false,
      },
      {
        key: 'name',
        dataType: 'string',
        type: 'tag',
        isColumn: true,
        isJSON: false,
        id: 'name--string--tag--true',
        isIndexed: false,
      },
      {
        key: 'durationNano',
        dataType: 'float64',
        type: 'tag',
        isColumn: true,
        isJSON: false,
        id: 'durationNano--float64--tag--true',
        isIndexed: false,
      },
      {
        key: 'httpMethod',
        dataType: 'string',
        type: 'tag',
        isColumn: true,
        isJSON: false,
        id: 'httpMethod--string--tag--true',
        isIndexed: false,
      },
      {
        key: 'responseStatusCode',
        dataType: 'string',
        type: 'tag',
        isColumn: true,
        isJSON: false,
        id: 'responseStatusCode--string--tag--true',
        isIndexed: false,
      },
    ],
    maxLines: 2,
    format: 'raw',
    fontSize: 'small',
  };

  const params = new URLSearchParams();
  params.set('compositeQuery', JSON.stringify(compositeQuery));
  params.set('options', JSON.stringify(options));
  params.set('pagination', JSON.stringify({ limit: 10, offset: 0 }));
  params.set('panelTypes', '"trace"');
  params.set('viewName', '""');
  params.set('viewKey', '""');
  params.set('relativeTime', relativeTime);

  return `${SIGNOZ_BASE}/traces-explorer?${params.toString()}`;
}

function makeSpanUrl(traceId: string, spanId: string) {
  return `${SIGNOZ_BASE}/trace/${traceId}?spanId=${spanId}`;
}

interface SignozLinkProps {
  conversationId: string;
}

interface SignozSpanLinkProps {
  traceId: string;
  spanId: string;
}

export function SignozLink({ conversationId }: SignozLinkProps) {
  return <ExternalLink href={makeTracesUrl(conversationId)}>View in SigNoz</ExternalLink>;
}

export function SignozSpanLink({ traceId, spanId }: SignozSpanLinkProps) {
  return <ExternalLink href={makeSpanUrl(traceId, spanId)}>View in SigNoz</ExternalLink>;
}

interface ConversationTracesLinkProps {
  conversationId: string;
}

export function ConversationTracesLink({ conversationId }: ConversationTracesLinkProps) {
  const tracesUrl = `http://localhost:3000/inkeep/projects/default/traces/conversations/${conversationId}`;
  return <ExternalLink href={tracesUrl}>View Conversation Traces</ExternalLink>;
}
