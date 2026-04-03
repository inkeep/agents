import { type NextRequest, NextResponse } from 'next/server';
import { getAgentsApiUrl } from '@/lib/api/api-config';
import { fetchWithRetry } from '@/lib/api/fetch-with-retry';

export const dynamic = 'force-dynamic';

type RouteContext<_T> = {
  params: Promise<Record<string, string>>;
};

export async function GET(req: NextRequest, context: RouteContext<'/api/traces/spans/[spanId]'>) {
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
    const agentsApiUrl = getAgentsApiUrl();
    const endpoint = `${agentsApiUrl}/manage/tenants/${tenantId}/signoz/span-lookup`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ conversationId, spanId }),
      credentials: 'include',
      timeout: 15000,
      maxAttempts: 3,
      label: 'signoz-span-lookup',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData?.message ?? 'Failed to fetch span details' },
        { status: response.status }
      );
    }

    const json = await response.json();
    const results = json?.data?.data?.results ?? [];
    const result = results?.[0];
    const columns: Array<{ name: string }> = result?.columns ?? [];
    const dataRows: unknown[][] = result?.data ?? [];

    if (!dataRows.length) {
      return NextResponse.json({ error: 'Span not found' }, { status: 404 });
    }

    const rawRow = dataRows[0];
    const row: Record<string, string> = {};
    columns.forEach((col, i) => {
      row[col.name] = rawRow[i] == null ? '' : String(rawRow[i]);
    });
    if (!row.trace_id || !row.span_id) {
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
