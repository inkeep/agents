import type { NextRequest } from 'next/server';

export async function POST(
  request: NextRequest,
  context: RouteContext<'/api/data-components/[dataComponentId]/generate-preview'>
) {
  try {
    const { dataComponentId } = await context.params;
    const body = await request.json();
    const { tenantId, projectId, instructions, existingCode } = body;

    if (!tenantId || !projectId) {
      return new Response('Missing tenantId or projectId', { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_AGENTS_MANAGE_API_URL || 'http://localhost:3002';
    const url = `${baseUrl}/tenants/${tenantId}/projects/${projectId}/data-components/${dataComponentId}/generate-preview`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        instructions: instructions || undefined,
        existingCode: existingCode || undefined,
      }),
    });

    if (!response.ok) {
      return new Response('Failed to generate preview', { status: response.status });
    }

    // Stream the response directly to the client
    return new Response(response.body, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('Error generating preview:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
