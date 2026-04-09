import type { StreamTextResult, ToolSet } from 'ai';
import { getLogger } from '../../../../logger';
import type { IncrementalStreamParser } from '../../stream/IncrementalStreamParser';
import type { AgentRunContext, ResolvedGenerationResponse } from '../agent-types';
import { resolveGenerationResponse } from '../agent-types';
import { setupStreamParser } from './stream-parser';

const logger = getLogger('StreamHandler');

export async function handleStreamGeneration(
  ctx: AgentRunContext,
  streamResult: StreamTextResult<ToolSet, any>,
  sessionId: string,
  contextId: string,
  hasStructuredOutput: boolean
): Promise<ResolvedGenerationResponse> {
  const parser = setupStreamParser(ctx, sessionId, contextId);

  if (hasStructuredOutput) {
    for await (const delta of streamResult.partialOutputStream) {
      if (delta) {
        await parser.processObjectDelta(delta);
      }
    }
  } else {
    await processStreamEvents(ctx, streamResult, parser);
  }

  await parser.finalize();

  const resolved = await resolveGenerationResponse(
    streamResult as unknown as Record<string, unknown>
  );

  const collectedParts = parser.getCollectedParts();
  return {
    ...resolved,
    ...(collectedParts.length > 0 && {
      formattedContent: {
        parts: collectedParts.map((part) => ({
          kind: part.kind,
          ...(part.kind === 'text' && { text: part.text }),
          ...(part.kind === 'data' && { data: part.data }),
        })),
      },
    }),
  };
}

export async function processStreamEvents(
  ctx: AgentRunContext,
  streamResult: StreamTextResult<ToolSet, any>,
  parser: IncrementalStreamParser
): Promise<void> {
  let currentStepToolCalls: string[] = [];

  for await (const event of streamResult.fullStream) {
    switch (event.type) {
      case 'text-delta':
        await parser.processTextChunk(event.text);
        break;
      case 'tool-call':
        currentStepToolCalls.push((event as any).toolName ?? 'unknown');
        parser.markToolResult();
        break;
      case 'tool-result':
        parser.markToolResult();
        break;
      case 'finish': {
        const finishEvent = event as any;
        logger.info(
          {
            agentId: ctx.config.id,
            finishReason: finishEvent.finishReason,
            toolCalls: currentStepToolCalls,
            usage: finishEvent.usage,
          },
          'Stream finish event'
        );
        currentStepToolCalls = [];
        if (finishEvent.finishReason === 'tool-calls') {
          parser.markToolResult();
        }
        break;
      }
      case 'error': {
        logger.error(
          {
            agentId: ctx.config.id,
            error: event.error instanceof Error ? event.error.message : JSON.stringify(event.error),
          },
          'Stream error event'
        );
        if (event.error instanceof Error) {
          throw event.error;
        }
        const errorMessage =
          (event.error as { error?: { message?: string } })?.error?.message ??
          JSON.stringify(event.error) ??
          'Unknown streaming error';
        throw new Error(errorMessage);
      }
    }
  }

  logger.info(
    { agentId: ctx.config.id },
    'Stream processing complete'
  );
}
