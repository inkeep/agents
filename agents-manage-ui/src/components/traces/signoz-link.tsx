import { useParams } from 'next/navigation';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { ExternalLink } from '../ui/external-link';

function makeTracesUrl(signozBaseUrl: string, conversationId: string, relativeTime = '2months') {
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

  return `${signozBaseUrl}/traces-explorer?${params.toString()}`;
}

function makeSpanUrl(signozBaseUrl: string, traceId: string, spanId: string) {
  return `${signozBaseUrl}/trace/${traceId}?spanId=${spanId}`;
}

interface SignozLinkProps {
  conversationId: string;
}

interface SignozSpanLinkProps {
  traceId: string;
  spanId: string;
}

export function SignozLink({ conversationId }: SignozLinkProps) {
  const { SIGNOZ_URL } = useRuntimeConfig();
  return (
    <ExternalLink href={makeTracesUrl(SIGNOZ_URL, conversationId)}>View Conversation in SigNoz</ExternalLink>
  );
}

export function SignozSpanLink({ traceId, spanId }: SignozSpanLinkProps) {
  const { SIGNOZ_URL } = useRuntimeConfig();
  return (
    <ExternalLink href={makeSpanUrl(SIGNOZ_URL, traceId, spanId)}>View span in SigNoz</ExternalLink>
  );
}

interface ConversationTracesLinkProps {
  conversationId: string;
}

export function ConversationTracesLink({ conversationId }: ConversationTracesLinkProps) {
  const { tenantId, projectId } = useParams();
  const tracesUrl = `/${tenantId}/projects/${projectId}/traces/conversations/${conversationId}`;
  return <ExternalLink href={tracesUrl}>View Conversation Traces</ExternalLink>;
}
