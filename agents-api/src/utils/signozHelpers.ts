import { QUERY_TYPES, SPAN_KEYS } from '@inkeep/agents-core';

const SERVICE_NAME_FILTER =
  "service.name IN ('inkeep-agents-api', 'inkeep-agents-run-api', 'inkeep-agents')";
const SPAN_LOOKUP_TABLE = 'distributed_signoz_index_v3';

/**
 * Row cap for the per-conversation numeric-attribute lookup. A conversation with more spans than
 * this has the overflow silently dropped from the number merge; callers can compare the returned
 * row count against this to detect and report truncation.
 */
export const CONVERSATION_SPAN_NUMBERS_LIMIT = 2000;

function buildSecurityExpression(tenantId: string, projectId?: string): string {
  let expr = `${SERVICE_NAME_FILTER} AND ${SPAN_KEYS.TENANT_ID} = '${tenantId}'`;
  if (projectId) expr += ` AND ${SPAN_KEYS.PROJECT_ID} = '${projectId}'`;
  return expr;
}

const ALLOWED_QUERY_TYPES = new Set([
  QUERY_TYPES.BUILDER_QUERY,
  QUERY_TYPES.BUILDER_TRACE_OPERATOR,
]);

/**
 * Enforces server-side filters on SigNoz v5 builder queries.
 * Scopes to known Inkeep services and prevents tenant/project filter bypass.
 * Rejects non-builder query types to prevent tenant isolation bypass via raw SQL.
 */
export function enforceSecurityFilters(payload: any, tenantId: string, projectId?: string): void {
  const queries: any[] = payload.compositeQuery?.queries ?? [];

  for (const query of queries) {
    if (!ALLOWED_QUERY_TYPES.has(query.type)) {
      throw new Error(`Unsupported query type: ${query.type}. Only builder queries are allowed.`);
    }
  }

  const securityExpr = buildSecurityExpression(tenantId, projectId);
  for (const { spec } of queries) {
    const existing = spec.filter?.expression;
    spec.filter = {
      expression: existing ? `(${existing}) AND ${securityExpr}` : securityExpr,
    };
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
  end: number
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

/**
 * Builds a tenant-scoped ClickHouse SQL payload returning the numeric attribute bundle for EVERY
 * span in a conversation (span_id -> toJSONString(attributes_number)). The builder-query proxy
 * drops `gen_ai.usage.*` / `gen_ai.cost.*` / `cache.intent.*` numeric attributes on some SigNoz
 * deployments (typed numeric selects + sum() return null); reading the raw number map as JSON — the
 * same approach the single-span lookup uses — is reliable. Callers merge these numbers back onto the
 * spans from the builder query. Tenant filtering is baked into the WHERE clause so this never goes
 * through the generic proxy's enforceSecurityFilters (which rejects non-builder queries).
 */
export function buildConversationNumbersPayload(
  tenantId: string,
  conversationId: string,
  start: number,
  end: number
): Record<string, unknown> {
  return {
    start,
    end,
    requestType: 'scalar',
    variables: {
      conversation_id: { type: 'custom', value: conversationId },
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
                span_id,
                toJSONString(attributes_number) AS attributes_number_json
              FROM signoz_traces.${SPAN_LOOKUP_TABLE}
              WHERE attributes_string['conversation.id'] = {{.conversation_id}}
                AND attributes_string['${SPAN_KEYS.TENANT_ID}'] = {{.tenant_id}}
                AND timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
                AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
              LIMIT ${CONVERSATION_SPAN_NUMBERS_LIMIT}
            `,
          },
        },
      ],
    },
  };
}
