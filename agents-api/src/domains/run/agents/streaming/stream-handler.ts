import type { StreamTextResult, ToolSet } from 'ai';
import type { IncrementalStreamParser } from '../../stream/IncrementalStreamParser';
import type { AgentRunContext } from '../agent-types';
import { setupStreamParser } from './stream-parser';

export async function handleStreamGeneration(
  ctx: AgentRunContext,
  streamResult: StreamTextResult<ToolSet, any>,
  sessionId: string,
  contextId: string,
  hasStructuredOutput: boolean
): Promise<StreamTextResult<ToolSet, any>> {
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
  const response = await streamResult;

  const collectedParts = parser.getCollectedParts();
  if (collectedParts.length > 0) {
    (response as StreamTextResult<ToolSet, any> & { formattedContent?: unknown }).formattedContent =
      {
        parts: collectedParts.map((part: any) => ({
          kind: part.kind,
          ...(part.kind === 'text' && { text: part.text }),
          ...(part.kind === 'data' && { data: part.data }),
        })),
      };
  }

  return response;
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
        const errorMessage = (event.error as { error?: { message?: string } })?.error?.message;
        throw new Error(errorMessage);
      }
    }
  }
}
