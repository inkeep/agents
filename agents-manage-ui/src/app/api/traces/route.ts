import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAgentsApiUrl } from '@/lib/api/api-config';
import { fetchWithRetry } from '@/lib/api/fetch-with-retry';
import { requireApiRouteSessionOrBearer } from '@/lib/auth/api-route-auth';
import { getLogger } from '@/lib/logger';

const queryEnvelopeSchema = z.object({
  type: z.string(),
  spec: z.record(z.string(), z.any()),
});

const compositeQuerySchema = z.object({
  queries: z.array(queryEnvelopeSchema),
});

const signozPayloadSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  requestType: z.enum(['scalar', 'time_series', 'raw', 'raw_stream', 'trace', 'distribution']),
  compositeQuery: compositeQuerySchema,
  variables: z.record(z.string(), z.any()).optional().default({}),
  formatOptions: z
    .object({
      fillGaps: z.boolean().optional(),
      formatTableResultForUI: z.boolean().optional(),
    })
    .optional(),
  noCache: z.boolean().optional(),
  projectId: z.string().optional(),
});

const pipelineRequestSchema = z.object({
  paginationPayload: signozPayloadSchema,
  detailPayloadTemplate: signozPayloadSchema,
});

// Custom validation function for time ranges
function validateTimeRange(start: number, end: number): { valid: boolean; error?: string } {
  const now = Date.now();

  if (start >= now) {
    return { valid: false, error: 'Start time cannot be in the future' };
  }

  if (end >= now) {
    return { valid: false, error: 'End time cannot be in the future' };
  }

  if (start >= end) {
    return { valid: false, error: 'Start time must be before end time' };
  }

  return { valid: true };
}

function extractRequestContext(request: NextRequest, authHeaders: Record<string, string>) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId') || 'default';
  const mode = url.searchParams.get('mode');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeaders,
  };

  return { tenantId, mode, headers };
}

function handleProxyError(error: unknown, logger: ReturnType<typeof getLogger>) {
  logger.error(
    { error, stack: error instanceof Error ? error.stack : undefined },
    'Error proxying to agents-api'
  );

  return NextResponse.json(
    {
      error: 'Failed to query SigNoz',
      details: error instanceof Error ? error.message : 'Unknown error',
    },
    { status: 500 }
  );
}

export async function POST(request: NextRequest) {
  const logger = getLogger('traces-proxy');
  const authResult = await requireApiRouteSessionOrBearer(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  const { tenantId, mode, headers } = extractRequestContext(request, authResult.headers);
  const agentsApiUrl = getAgentsApiUrl();

  try {
    const body = await request.json();

    if (mode === 'batch') {
      const validationResult = pipelineRequestSchema.safeParse(body);
      if (!validationResult.success) {
        return NextResponse.json(
          { error: 'Invalid request body', details: validationResult.error.flatten() },
          { status: 400 }
        );
      }

      const { paginationPayload, detailPayloadTemplate } = validationResult.data;

      const paginationTimeValidation = validateTimeRange(
        paginationPayload.start,
        paginationPayload.end
      );
      if (!paginationTimeValidation.valid) {
        return NextResponse.json(
          {
            error: 'Invalid time range in paginationPayload',
            details: paginationTimeValidation.error,
          },
          { status: 400 }
        );
      }

      const detailTimeValidation = validateTimeRange(
        detailPayloadTemplate.start,
        detailPayloadTemplate.end
      );
      if (!detailTimeValidation.valid) {
        return NextResponse.json(
          {
            error: 'Invalid time range in detailPayloadTemplate',
            details: detailTimeValidation.error,
          },
          { status: 400 }
        );
      }

      const endpoint = `${agentsApiUrl}/manage/tenants/${tenantId}/signoz/query-batch`;
      logger.info({ endpoint }, 'Forwarding batch request to agents-api');

      const response = await fetchWithRetry(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(validationResult.data),
        credentials: 'include',
        timeout: 60000,
        maxAttempts: 2,
        label: 'signoz-batch-query',
      });

      const data = await response.json();
      if (!response.ok) {
        return NextResponse.json(
          { error: 'Failed to query SigNoz', details: data?.message ?? response.statusText },
          { status: response.status }
        );
      }

      return NextResponse.json(data);
    }

    const validationResult = signozPayloadSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: validationResult.error.flatten() },
        { status: 400 }
      );
    }

    const validatedBody = validationResult.data;

    const timeValidation = validateTimeRange(validatedBody.start, validatedBody.end);
    if (!timeValidation.valid) {
      return NextResponse.json(
        { error: 'Invalid time range', details: timeValidation.error },
        { status: 400 }
      );
    }

    const endpoint = `${agentsApiUrl}/manage/tenants/${tenantId}/signoz/query`;
    logger.info({ endpoint }, 'Forwarding validated query to agents-api');

    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(validatedBody),
      credentials: 'include',
      timeout: 30000,
      maxAttempts: 2,
      label: 'signoz-query',
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to query SigNoz', details: data?.message ?? response.statusText },
        { status: response.status }
      );
    }

    logger.info({ status: response.status }, 'Agents-api response received');

    return NextResponse.json(data);
  } catch (error) {
    return handleProxyError(error, logger);
  }
}

export async function GET(request: NextRequest) {
  const logger = getLogger('traces-config-check');
  const authResult = await requireApiRouteSessionOrBearer(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  try {
    const { tenantId, headers } = extractRequestContext(request, authResult.headers);
    const agentsApiUrl = getAgentsApiUrl();
    const endpoint = `${agentsApiUrl}/manage/tenants/${tenantId}/signoz/health`;

    logger.info({ endpoint }, 'Checking SigNoz configuration via agents-api');

    const response = await fetchWithRetry(endpoint, {
      method: 'GET',
      headers,
      credentials: 'include',
      timeout: 5000,
      maxAttempts: 3,
      label: 'signoz-health',
    });

    const data = await response.json();

    if (!response.ok) {
      logger.error(
        {
          error: data,
          status: response.status,
        },
        'SigNoz health check failed'
      );

      let errorMessage = 'Failed to check SigNoz configuration';
      if (response.status === 401 || response.status === 403) {
        errorMessage = 'Authentication required';
      } else if (data?.error) {
        errorMessage = data.error;
      }

      return NextResponse.json({
        status: 'connection_failed',
        configured: false,
        error: errorMessage,
      });
    }

    logger.info({ status: response.status }, 'SigNoz health check successful');

    return NextResponse.json(data);
  } catch (error) {
    logger.error(
      {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      'SigNoz health check failed'
    );

    let errorMessage = 'Failed to check SigNoz configuration';
    if (error instanceof TypeError) {
      errorMessage = 'Management API not reachable';
    }

    return NextResponse.json({
      status: 'connection_failed',
      configured: false,
      error: errorMessage,
    });
  }
}
