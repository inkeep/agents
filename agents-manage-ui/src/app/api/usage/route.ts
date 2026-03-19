import { type NextRequest, NextResponse } from 'next/server';
import { getAgentsApiUrl } from '@/lib/api/api-config';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId');
  const endpoint = url.searchParams.get('endpoint');

  if (!tenantId || !endpoint) {
    return NextResponse.json({ error: 'Missing tenantId or endpoint parameter' }, { status: 400 });
  }

  const cookieHeader = request.headers.get('cookie');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  const bypassSecret = process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET;
  if (bypassSecret) {
    headers.Authorization = `Bearer ${bypassSecret}`;
  }

  const forwardParams = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    if (key !== 'tenantId' && key !== 'endpoint') {
      forwardParams.set(key, value);
    }
  }

  const agentsApiUrl = getAgentsApiUrl();
  const apiUrl = `${agentsApiUrl}/manage/tenants/${tenantId}/usage/${endpoint}?${forwardParams.toString()}`;

  try {
    const response = await fetch(apiUrl, { headers, cache: 'no-store' });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: 'Upstream API error', details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch usage data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
