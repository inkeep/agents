import axios from 'axios';
import axiosRetry from 'axios-retry';

// Configure axios retry
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
});

// Attribute key constants
const ATTRIBUTE_KEYS = {
  CONVERSATION_ID: 'conversation.id',
} as const;

/**
 * Using for all span attributes (not possible via Trace API)
 */

export type SpanRow = {
  trace_id: string;
  span_id: string;
  timestamp: string;
  name: string;
  parent_span_id: string | null;
  attributes_string_json: string;
  attributes_number_json: string;
  attributes_bool_json: string;
  resources_string_json: string;
};

/**
 * Fetch all span attributes for given trace IDs using optimized SQL query
 */
export async function fetchAllSpanAttributes_SQL(
  conversationId: string,
  sigNozUrl: string,
  apiKey: string
): Promise<
  Array<{
    spanId: string;
    traceId: string;
    timestamp: string;
    data: Record<string, any>;
  }>
> {

  const results: Array<{
    spanId: string;
    traceId: string;
    timestamp: string;
    data: Record<string, any>;
  }> = [];

  const LIMIT = 1000;
  let offset = 0;
  const tableName = 'distributed_signoz_index_v3';


  const basePayload = {
    start: new Date('2020-01-01T00:00:00Z').getTime(),
    end: Date.now(),
    step: 60,
    variables: {
      conversation_id: conversationId,
      limit: LIMIT,
      offset: 0,
    },
    compositeQuery: {
      queryType: 'clickhouse_sql',
      panelType: 'table',
      chQueries: {
        A: {
          query: `
            SELECT
              trace_id, span_id, parent_span_id,
              timestamp,
              name,
              toJSONString(attributes_string) AS attributes_string_json,
              toJSONString(attributes_number) AS attributes_number_json,
              toJSONString(attributes_bool)   AS attributes_bool_json,
              toJSONString(resources_string)  AS resources_string_json
            FROM signoz_traces.${tableName}
            WHERE attributes_string['${ATTRIBUTE_KEYS.CONVERSATION_ID}'] = {{.conversation_id}}
              AND timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
              AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
            ORDER BY timestamp DESC
            LIMIT {{.limit}} OFFSET {{.offset}}
          `,
        },
      },
    },
  };

  while (true) {
    const payload = JSON.parse(JSON.stringify(basePayload));
    payload.variables.offset = offset;
    const signozEndpoint = `${sigNozUrl}/api/v4/query_range`;
    try {
      const response = await axios.post(signozEndpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          'SIGNOZ-API-KEY': apiKey,
        },
        timeout: 30000,
      });

      const json = response.data;

      const result = json?.data?.result?.[0];
      let rows: SpanRow[] = [];
      
      // Check if result and series exist before mapping
      if (result?.series) {
        rows = result.series
          .map((s: any) => ({
            trace_id: s.labels?.trace_id,
            span_id: s.labels?.span_id,
            parent_span_id: s.labels?.parent_span_id,
            timestamp: s.labels?.timestamp,
            name: s.labels?.name,
            attributes_string_json: s.labels?.attributes_string_json,
            attributes_number_json: s.labels?.attributes_number_json,
            attributes_bool_json: s.labels?.attributes_bool_json,
            resources_string_json: s.labels?.resources_string_json,
          }))
          .filter((r: any) => r.trace_id && r.span_id); // Filter out incomplete rows
      }

      if (!rows.length) {
        break;
      }

      for (const r of rows) {
        // Build the span.data bag from the projected JSON maps
        const attrsString = JSON.parse(r.attributes_string_json || '{}');
        const attrsNum = JSON.parse(r.attributes_number_json || '{}');
        const attrsBool = JSON.parse(r.attributes_bool_json || '{}');
        const resString = JSON.parse(r.resources_string_json || '{}');

        results.push({
          spanId: r.span_id,
          traceId: r.trace_id,
          timestamp: r.timestamp,
          data: {
            // Essential span identification fields
            name: r.name,
            spanID: r.span_id,
            traceID: r.trace_id,
            parentSpanID: r.parent_span_id,
            // All actual attributes from OpenTelemetry
            ...attrsString,
            ...attrsNum,
            ...attrsBool,
            ...resString,
          },
        });
      }

      offset += LIMIT;
      if (rows.length < LIMIT) {
        // console.log(`🔍 DEBUG - Last page (${rows.length} < ${LIMIT}), breaking pagination`);
        break;
      }
    } catch (error) {
      console.error(`❌ Error fetching spans at offset ${offset}:`, error);
      break;
    }
  }

  return results;
}
