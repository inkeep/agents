import axios from 'axios';
import axiosRetry from 'axios-retry';

// Configure axios retry
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
});

export type ConversationException = {
  spanId: string;
  traceId: string;
  timestamp: string;
  exceptionType: string;
  exceptionMessage: string;
  exceptionStacktrace: string;
  serviceName?: string;
};

export type SpanData = {
  spanId: string;
  traceId: string;
  timestamp: string;
  data: Record<string, any>;
};

/**
 * Extract unique trace IDs from span data
 */
export function extractTraceIds(spans: SpanData[]): string[] {
  const traceIds = new Set<string>();

  for (const span of spans) {
    if (span.traceId && span.traceId !== 'unknown') {
      traceIds.add(span.traceId);
    }
  }

  return Array.from(traceIds);
}

/**
 * Fetch exceptions for specific trace IDs from distributed_signoz_error_index_v2
 */
export async function fetchExceptionsByTraceIds(
  traceIds: string[],
  sigNozUrl: string,
  apiKey: string
): Promise<ConversationException[]> {
  if (traceIds.length === 0) {
    return [];
  }

  const traceIdList = traceIds.map((id) => `'${id}'`).join(', ');

  const query = `
    SELECT
      traceID,
      spanID,
      formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%s.%fZ') as timestamp,
      exceptionType,
      exceptionMessage,
      exceptionStacktrace,
      serviceName
    FROM signoz_traces.distributed_signoz_error_index_v2
    WHERE traceID IN (${traceIdList})
    ORDER BY timestamp DESC
    LIMIT 100
  `;

  const payload = {
    start: Date.now() - 30 * 24 * 60 * 60 * 1000,
    end: Date.now(),
    step: 60,
    compositeQuery: {
      queryType: 'clickhouse_sql',
      panelType: 'table',
      chQueries: {
        A: {
          query,
        },
      },
    },
  };

  try {
    const response = await axios.post(`${sigNozUrl}/api/v4/query_range`, payload, {
      headers: {
        'Content-Type': 'application/json',
        'SIGNOZ-API-KEY': apiKey,
      },
      timeout: 30000,
    });

    const responseData = response.data;
    const exceptions =
      responseData?.data?.result?.[0]?.series?.map((item: any) => {
        const labels = item.labels || {};
        return {
          spanId: labels.spanID || 'unknown',
          traceId: labels.traceID || 'unknown',
          timestamp: labels.timestamp || new Date().toISOString(),
          exceptionType: labels.exceptionType || 'Unknown Exception',
          exceptionMessage: labels.exceptionMessage || 'No message available',
          exceptionStacktrace: labels.exceptionStacktrace || 'No stack trace available',
          serviceName: labels.serviceName || 'unknown',
        };
      }) || [];

    return exceptions;
  } catch {
    return [];
  }
}
