import { type NextRequest, NextResponse } from 'next/server';
import { extractTraceIds, fetchExceptionsByTraceIds } from '@/lib/api/signoz-exceptions';
import { fetchAllSpanAttributes_SQL } from '@/lib/api/signoz-sql';
import { getLogger } from '@/lib/logger';
import { DEFAULT_SIGNOZ_URL } from '@/lib/runtime-config/defaults';

export const dynamic = 'force-dynamic';

const SIGNOZ_URL = process.env.SIGNOZ_URL || DEFAULT_SIGNOZ_URL;
const SIGNOZ_API_KEY = process.env.SIGNOZ_API_KEY || '';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ conversationId: string }> }
) {
  const params = await context.params;
  const { conversationId } = params;

  if (!conversationId) {
    return NextResponse.json({ error: 'Conversation ID is required' }, { status: 400 });
  }

  const logger = getLogger('conversation-exceptions-endpoint');

  try {
    logger.info({ conversationId }, 'Fetching conversation exceptions');

    // Check if API key is configured
    if (!SIGNOZ_API_KEY) {
      logger.warn('SIGNOZ_API_KEY not configured');
      return NextResponse.json(
        {
          exceptions: [],
          message: 'SigNoz API key not configured',
        },
        { status: 200 }
      );
    }
    const spans = await fetchAllSpanAttributes_SQL(conversationId, SIGNOZ_URL, SIGNOZ_API_KEY);
    const traceIds = extractTraceIds(spans);
    const exceptions = await fetchExceptionsByTraceIds(traceIds, SIGNOZ_URL, SIGNOZ_API_KEY);

    return NextResponse.json({
      exceptions,
      count: exceptions.length,
    });
  } catch (error) {
    logger.error(
      {
        error,
        conversationId,
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      'Failed to fetch conversation exceptions'
    );
    return NextResponse.json(
      {
        exceptions: [],
        count: 0,
        error: error instanceof Error ? error.message : 'Failed to fetch exceptions',
      },
      { status: 200 }
    );
  }
}
