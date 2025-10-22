import type { NextRequest } from 'next/server';

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

    const runApiUrl = process.env.PUBLIC_INKEEP_AGENTS_RUN_API_URL || 'http://localhost:3003';
    const url = `${runApiUrl}/v1/${tenantId}/projects/${projectId}/data-components/${dataComponentId}/generate-render`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET && {
          Authorization: `Bearer ${process.env.PUBLIC_INKEEP_AGENTS_RUN_API_BYPASS_SECRET}`,
          'x-inkeep-tenant-id': tenantId,
          'x-inkeep-project-id': projectId,
        }),
      },
      body: JSON.stringify({
        instructions: instructions || undefined,
        existingCode: existingCode || undefined,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unable to read error');
      console.error('Run API returned error:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        url,
      });
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
