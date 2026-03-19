import { QUERY_TYPES, SPAN_KEYS } from '@inkeep/agents-core';

const SERVICE_NAME_FILTER = "serviceName IN ('inkeep-agents-api', 'inkeep-agents-run-api', 'inkeep-agents')";
const SPAN_LOOKUP_TABLE = 'distributed_signoz_index_v3';

function buildSecurityExpression(tenantId: string, projectId?: string): string {
  let expr = `${SERVICE_NAME_FILTER} AND ${SPAN_KEYS.TENANT_ID} = '${tenantId}'`;
  if (projectId) expr += ` AND ${SPAN_KEYS.PROJECT_ID} = '${projectId}'`;
  return expr;
}

/**
 * Enforces server-side filters on SigNoz v5 builder queries.
 * Scopes to known Inkeep services and prevents tenant/project filter bypass.
 * Rejects non-builder query types to prevent tenant isolation bypass via raw SQL.
 */
export function enforceSecurityFilters(payload: any, tenantId: string, projectId?: string): void {
  const queries: any[] = payload.compositeQuery?.queries ?? [];

  for (const query of queries) {
    if (query.type !== QUERY_TYPES.BUILDER_QUERY) {
      throw new Error(`Unsupported query type: ${query.type}. Only builder queries are allowed.`);
    }
  }

  const securityExpr = buildSecurityExpression(tenantId, projectId);
  for (const { spec } of queries) {
    spec.filter = { expression: `(${spec.filter.expression}) AND ${securityExpr}` };
  }
}

/**
 * Builds a tenant-scoped ClickHouse SQL payload for looking up a single span.
 * Tenant filtering is baked into the WHERE clause so this never goes through
 * the generic proxy's enforceSecurityFilters (which rejects non-builder queries).
 */
export function buildSpanLookupPayload(
  tenantId: string,
  conversationId: string,
  spanId: string,
  start: number,
  end: number,
): Record<string, unknown> {
  return {
    start,
    end,
    requestType: 'scalar',
    variables: {
      conversation_id: { type: 'custom', value: conversationId },
      span_id: { type: 'custom', value: spanId },
      tenant_id: { type: 'custom', value: tenantId },
    },
    compositeQuery: {
      queries: [
        {
          type: 'clickhouse_sql',
          spec: {
            name: 'A',
            query: `
              SELECT
                trace_id, span_id, parent_span_id,
                timestamp,
                name,
                toJSONString(attributes_string) AS attributes_string_json,
                toJSONString(attributes_number) AS attributes_number_json,
                toJSONString(attributes_bool)   AS attributes_bool_json,
                toJSONString(resources_string)  AS resources_string_json
              FROM signoz_traces.${SPAN_LOOKUP_TABLE}
              WHERE attributes_string['conversation.id'] = {{.conversation_id}}
                AND attributes_string['${SPAN_KEYS.TENANT_ID}'] = {{.tenant_id}}
                AND span_id = {{.span_id}}
                AND timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
                AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
              LIMIT 1
            `,
          },
        },
      ],
    },
  };
}
