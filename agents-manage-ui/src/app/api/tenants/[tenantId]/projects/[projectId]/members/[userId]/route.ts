import { cookies, headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';
import { getManageApiUrl } from '@/lib/api/api-config';

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

// PATCH - Update project member role
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; projectId: string; userId: string }> }
) {
  const { tenantId, projectId, userId } = await params;
  const apiUrl = getManageApiUrl();
  const authHeaders = await getAuthHeaders();
  const body = await request.json();

  const response = await fetch(
    `${apiUrl}/tenants/${tenantId}/projects/${projectId}/members/${userId}`,
    {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}

// DELETE - Remove project member
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tenantId: string; projectId: string; userId: string }> }
) {
  const { tenantId, projectId, userId } = await params;
  const apiUrl = getManageApiUrl();
  const authHeaders = await getAuthHeaders();
  const { searchParams } = new URL(request.url);
  const role = searchParams.get('role');

  const response = await fetch(
    `${apiUrl}/tenants/${tenantId}/projects/${projectId}/members/${userId}?role=${role}`,
    {
      method: 'DELETE',
      headers: authHeaders,
    }
  );

  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}
