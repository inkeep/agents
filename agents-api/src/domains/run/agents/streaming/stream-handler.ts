import type { StreamTextResult, ToolSet } from 'ai';
import type { IncrementalStreamParser } from '../../stream/IncrementalStreamParser';
import type { AgentRunContext, ResolvedGenerationResponse } from '../agent-types';
import { resolveGenerationResponse } from '../agent-types';
import { setupStreamParser } from './stream-parser';

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
    await processStreamEvents(streamResult, parser);
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
  streamResult: StreamTextResult<ToolSet, any>,
  parser: IncrementalStreamParser
): Promise<void> {
  for await (const event of streamResult.fullStream) {
    switch (event.type) {
      case 'text-delta':
        await parser.processTextChunk(event.text);
        break;
      case 'tool-call':
        parser.markToolResult();
        break;
      case 'tool-result':
        parser.markToolResult();
        break;
      case 'finish':
        if (event.finishReason === 'tool-calls') {
          parser.markToolResult();
        }
        break;
      case 'error': {
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
}
