import axios from 'axios';
import axiosRetry from 'axios-retry';
import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getLogger } from '@/lib/logger';
import { DEFAULT_SIGNOZ_URL } from '@/lib/runtime-config/defaults';

// Configure axios retry
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
});

const SIGNOZ_URL = process.env.SIGNOZ_URL || DEFAULT_SIGNOZ_URL;
const SIGNOZ_API_KEY = process.env.SIGNOZ_API_KEY || '';

// Validation schema for the request body
const signozRequestSchema = z.object({
  start: z.number().int().positive(),
  end: z.number().int().positive(),
  step: z.number().int().positive().optional().default(60),
  variables: z.record(z.string(), z.any()).optional().default({}),
  compositeQuery: z.object({
    queryType: z.string(),
    panelType: z.string(),
    builderQueries: z.record(z.string(), z.any()),
  }),
  dataSource: z.string().optional(),
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

export async function POST(request: NextRequest) {
  const logger = getLogger('signoz-proxy');
  try {
    const body = await request.json();

    // Validate request body structure
    const validationResult = signozRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request body',
          details: validationResult.error.flatten(),
        },
        { status: 400 }
      );
    }

    const validatedBody = validationResult.data;

    // Validate time range
    const timeValidation = validateTimeRange(validatedBody.start, validatedBody.end);
    if (!timeValidation.valid) {
      return NextResponse.json(
        {
          error: 'Invalid time range',
          details: timeValidation.error,
        },
        { status: 400 }
      );
    }

    const signozEndpoint = `${SIGNOZ_URL}/api/v4/query_range`;
    logger.info({ endpoint: signozEndpoint }, 'Calling SigNoz');

    const response = await axios.post(signozEndpoint, validatedBody, {
      headers: {
        'Content-Type': 'application/json',
        'SIGNOZ-API-KEY': SIGNOZ_API_KEY,
      },
      timeout: 30000,
    });

    logger.info({ status: response.status }, 'SigNoz response received');

    const data = response.data;

    return NextResponse.json(data);
  } catch (error) {
    logger.error(
      { error, stack: error instanceof Error ? error.stack : undefined },
      'Error proxying to SigNoz'
    );
    return NextResponse.json(
      {
        error: 'Failed to connect to SigNoz',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    configured: !!SIGNOZ_URL && !!SIGNOZ_API_KEY,
  });
}
