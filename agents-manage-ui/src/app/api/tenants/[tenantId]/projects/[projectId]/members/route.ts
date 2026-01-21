import { cookies, headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { getAgentsApiUrl } from '@/lib/api/api-config';

async function getAuthHeaders() {
  let cookieHeader: string | undefined;

  try {
    const headerStore = await headers();
    const rawCookieHeader = headerStore.get('cookie');

    if (rawCookieHeader) {
      const cookiePairs = rawCookieHeader.split(';').map((c) => c.trim());
      const authCookies = cookiePairs.filter((c) => c.includes('better-auth'));
      cookieHeader = authCookies.join('; ');
    }

    if (!cookieHeader) {
      const cookieStore = await cookies();
      const allCookies = cookieStore.getAll();
      const authCookies = allCookies.filter((c) => c.name.includes('better-auth'));
      cookieHeader = authCookies.map((c) => `${c.name}=${c.value}`).join('; ');
    }
  } catch {
    // Not in server context
  }

  return {
    'Content-Type': 'application/json',
    ...(cookieHeader && { Cookie: cookieHeader }),
    ...(process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET && {
      Authorization: `Bearer ${process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET}`,
    }),
  };
}

// GET - List project members
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; projectId: string }> }
) {
  const { tenantId, projectId } = await params;
  const apiUrl = getAgentsApiUrl();
  const headers = await getAuthHeaders();

  const response = await fetch(
    `${apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/members`,
    {
      headers,
    }
  );

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

// POST - Add project member
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; projectId: string }> }
) {
  const { tenantId, projectId } = await params;
  const apiUrl = getAgentsApiUrl();
  const authHeaders = await getAuthHeaders();
  const body = await request.json();

  const response = await fetch(
    `${apiUrl}/manage/tenants/${tenantId}/projects/${projectId}/members`,
    {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
