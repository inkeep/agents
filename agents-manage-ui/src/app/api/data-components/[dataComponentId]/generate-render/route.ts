/**
 * API Route: Generate Component Render (Proxy)
 *
 * Proxies component render generation requests to the manage-api endpoint.
 * This maintains backward compatibility while centralizing AI generation logic.
 */

import type { NextRequest } from 'next/server';

const MANAGE_API_URL =
  process.env.INKEEP_AGENTS_MANAGE_API_URL || 'http://localhost:3001';

export async function POST(
  request: NextRequest,
  context: RouteContext<'/api/data-components/[dataComponentId]/generate-render'>
) {
  try {
    const { dataComponentId } = await context.params;
    const body = await request.json();
    const { tenantId, projectId, instructions, existingCode } = body;

    if (!tenantId || !projectId) {
      return new Response('Missing tenantId or projectId', { status: 400 });
    }

    const manageApiUrl = `${MANAGE_API_URL}/tenants/${tenantId}/projects/${projectId}/data-components/${dataComponentId}/generate-render`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET) {
      headers.Authorization = `Bearer ${process.env.INKEEP_AGENTS_MANAGE_API_BYPASS_SECRET}`;
    }

    const response = await fetch(manageApiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        instructions,
        existingCode,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(errorText || 'Failed to generate render', { status: response.status });
    }

    if (!response.body) {
      return new Response('No response body from manage-api', { status: 500 });
    }

    return new Response(response.body, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('Error proxying component render generation:', error);
    return new Response(error instanceof Error ? error.message : 'Internal server error', {
      status: 500,
    });
  }
}
