import type { AxiosResponse } from 'axios';
import axios from 'axios';
import axiosRetry from 'axios-retry';
import { type NextRequest, NextResponse } from 'next/server';
import { getAgentsApiUrl } from '@/lib/api/api-config';

axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
});

export const dynamic = 'force-dynamic';

const DEFAULT_LOOKBACK_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

function shouldCallSigNozDirectly(cookieHeader: string | null): boolean {
  return !cookieHeader && !!process.env.SIGNOZ_URL && !!process.env.SIGNOZ_API_KEY;
}

function getSigNozEndpoint(): string {
  const signozUrl = process.env.SIGNOZ_URL || process.env.PUBLIC_SIGNOZ_URL;
  return `${signozUrl}/api/v4/query_range`;
}

type RouteContext<_T> = {
  params: Promise<Record<string, string>>;
};

export async function GET(req: NextRequest, context: RouteContext<'/api/signoz/spans/[spanId]'>) {
  const { spanId } = await context.params;
  if (!spanId) {
    return NextResponse.json({ error: 'Span ID is required' }, { status: 400 });
  }

  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenantId') || 'default';
  const conversationId = url.searchParams.get('conversationId');

  if (!conversationId) {
    return NextResponse.json({ error: 'conversationId query param is required' }, { status: 400 });
  }

  const cookieHeader = req.headers.get('cookie');

  try {
    const now = Date.now();
    const tableName = 'distributed_signoz_index_v3';

    const payload = {
      start: now - DEFAULT_LOOKBACK_MS,
      end: now,
      step: 60,
      variables: {
        conversation_id: conversationId,
        span_id: spanId,
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
              WHERE attributes_string['conversation.id'] = {{.conversation_id}}
                AND span_id = {{.span_id}}
                AND timestamp BETWEEN {{.start_datetime}} AND {{.end_datetime}}
                AND ts_bucket_start BETWEEN {{.start_timestamp}} - 1800 AND {{.end_timestamp}}
              LIMIT 1
            `,
          },
        },
      },
    };

    let response: AxiosResponse;

    if (shouldCallSigNozDirectly(cookieHeader)) {
      const endpoint = getSigNozEndpoint();
      response = await axios.post(endpoint, payload, {
        headers: {
          'Content-Type': 'application/json',
          'SIGNOZ-API-KEY': process.env.SIGNOZ_API_KEY || '',
        },
        timeout: 15000,
      });
    } else {
      const agentsApiUrl = getAgentsApiUrl();
      const endpoint = `${agentsApiUrl}/manage/tenants/${tenantId}/signoz/query`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (cookieHeader) {
        headers.Cookie = cookieHeader;
      }
      response = await axios.post(endpoint, payload, {
        headers,
        timeout: 15000,
        withCredentials: true,
      });
    }

    const json = response.data;
    const result = json?.data?.result?.[0];
    const series = result?.series;

    if (!series || series.length === 0) {
      return NextResponse.json({ error: 'Span not found' }, { status: 404 });
    }

    const row = series[0]?.labels;
    if (!row?.trace_id || !row?.span_id) {
      return NextResponse.json({ error: 'Span not found' }, { status: 404 });
    }

    const attrsString = JSON.parse(row.attributes_string_json || '{}');
    const attrsNum = JSON.parse(row.attributes_number_json || '{}');
    const attrsBool = JSON.parse(row.attributes_bool_json || '{}');
    const resString = JSON.parse(row.resources_string_json || '{}');

    return NextResponse.json({
      spanId: row.span_id,
      traceId: row.trace_id,
      timestamp: row.timestamp,
      data: {
        name: row.name,
        spanID: row.span_id,
        traceID: row.trace_id,
        parentSpanID: row.parent_span_id,
        ...attrsString,
        ...attrsNum,
        ...attrsBool,
        ...resString,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch span details';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
