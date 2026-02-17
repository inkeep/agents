import axios from 'axios';
import axiosRetry from 'axios-retry';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAgentsApiUrl } from '@/lib/api/api-config';
import { getLogger } from '@/lib/logger';

// Configure axios retry
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
});

const compositeQuerySchema = z.object({
  queryType: z.string(),
  panelType: z.string(),
  builderQueries: z.record(z.string(), z.any()),
});

const signozPayloadSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  step: z.number().int().positive().optional().default(60),
  variables: z.record(z.string(), z.any()).optional().default({}),
  compositeQuery: compositeQuerySchema,
  dataSource: z.string().optional(),
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

function extractRequestContext(request: NextRequest) {
  const url = new URL(request.url);
  const tenantId = url.searchParams.get('tenantId') || 'default';
  const mode = url.searchParams.get('mode');

  const cookieHeader = request.headers.get('cookie');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookieHeader) {
    headers.Cookie = cookieHeader;
  }

  return { tenantId, mode, headers };
}

function handleProxyError(error: unknown, logger: ReturnType<typeof getLogger>) {
  logger.error(
    { error, stack: error instanceof Error ? error.stack : undefined },
    'Error proxying to agents-api'
  );

  if (axios.isAxiosError(error)) {
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || error.message;
    return NextResponse.json({ error: 'Failed to query SigNoz', details: message }, { status });
  }

  return NextResponse.json(
    {
      error: 'Failed to query SigNoz',
      details: error instanceof Error ? error.message : 'Unknown error',
    },
    { status: 500 }
  );
}

export async function POST(request: NextRequest) {
  const logger = getLogger('signoz-proxy');
  const { tenantId, mode, headers } = extractRequestContext(request);
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

      const endpoint = `${agentsApiUrl}/manage/tenants/${tenantId}/signoz/query-batch`;
      logger.info({ endpoint }, 'Forwarding batch request to agents-api');

      const response = await axios.post(endpoint, validationResult.data, {
        headers,
        timeout: 60000,
        withCredentials: true,
      });

      return NextResponse.json(response.data);
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

    const response = await axios.post(endpoint, validatedBody, {
      headers,
      timeout: 30000,
      withCredentials: true,
    });

    logger.info({ status: response.status }, 'Agents-api response received');

    return NextResponse.json(response.data);
  } catch (error) {
    return handleProxyError(error, logger);
  }
}

export async function GET(request: NextRequest) {
  const logger = getLogger('signoz-config-check');

  try {
    // Extract tenantId from query params
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenantId') || 'default';

    // Forward cookies for authentication
    const cookieHeader = request.headers.get('cookie');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cookieHeader) {
      headers.Cookie = cookieHeader;
    }

    // Forward to agents-api health endpoint
    const agentsApiUrl = getAgentsApiUrl();
    const endpoint = `${agentsApiUrl}/manage/tenants/${tenantId}/signoz/health`;

    logger.info({ endpoint }, 'Checking SigNoz configuration via agents-api');

    const response = await axios.get(endpoint, {
      headers,
      timeout: 5000,
      withCredentials: true,
    });

    logger.info({ status: response.status }, 'SigNoz health check successful');

    return NextResponse.json(response.data);
  } catch (error) {
    logger.error(
      {
        error,
        message: error instanceof Error ? error.message : 'Unknown error',
        code: axios.isAxiosError(error) ? error.code : undefined,
        status: axios.isAxiosError(error) ? error.response?.status : undefined,
      },
      'SigNoz health check failed'
    );

    let errorMessage = 'Failed to check SigNoz configuration';
    const configured = false;

    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = 'Management API not reachable';
      } else if (error.response?.status === 401 || error.response?.status === 403) {
        errorMessage = 'Authentication required';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
    }

    return NextResponse.json({
      status: 'connection_failed',
      configured,
      error: errorMessage,
    });
  }
}
