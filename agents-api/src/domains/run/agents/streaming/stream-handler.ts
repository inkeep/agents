import { parsePartialJson, type StreamTextResult, type ToolSet } from 'ai';
import type { IncrementalStreamParser } from '../../stream/IncrementalStreamParser';
import type { AgentRunContext, ResolvedGenerationResponse } from '../agent-types';
import { resolveGenerationResponse } from '../agent-types';
import { setupStreamParser } from './stream-parser';

/**
 * Orchestrate the consumption of a streamText result for the live-wire path.
 *
 * For structured-output generation we drive two cooperating sources into the same parser:
 *   - `fullStream`: raw text-delta events (we parse the JSON tokens ourselves and emit object
 *     deltas at per-text-delta granularity — see `processStreamEvents`).
 *   - `partialOutputStream`: the SDK's pre-parsed object deltas. These arrive at coarser
 *     boundaries but give us a safety net: if our JSON parse ever lags or misclassifies, the
 *     partial stream will still drive the parser. The parser dedupes by length, so whichever
 *     path delivers a given text prefix first wins and the other is a no-op.
 *
 * Abort wiring: fullStream and partialOutputStream share the same underlying SDK source, so an
 * error on fullStream terminates partialOutputStream shortly after. The AbortController is a
 * belt-and-braces cancellation: if fullStream throws, we signal the partialOutput consumer to
 * bail at its next iteration rather than continue processing deltas on a parser whose caller
 * already considers the stream finished.
 */
export async function handleStreamGeneration(
  ctx: AgentRunContext,
  streamResult: StreamTextResult<ToolSet, any>,
  sessionId: string,
  contextId: string,
  hasStructuredOutput: boolean
): Promise<ResolvedGenerationResponse> {
  const parser = setupStreamParser(ctx, sessionId, contextId);

  if (hasStructuredOutput) {
    const abort = new AbortController();
    try {
      await Promise.all([
        processStreamEvents(streamResult, parser, abort.signal, /* structuredOutputMode */ true),
        consumePartialOutputStream(streamResult, parser, abort.signal),
      ]);
    } catch (err) {
      abort.abort();
      throw err;
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

/**
 * Iterate `fullStream` and forward events to the parser.
 *
 * In `structuredOutputMode` we classify each step on its first non-whitespace text-delta char
 * so one generation can interleave free-form reasoning and JSON output across steps:
 *   - JSON (`{` or `[`): accumulate text-deltas into a per-step buffer, repair-parse on each
 *     update via `parsePartialJson`, and feed the resulting cumulative object to the parser.
 *     This is the fine-grained-streaming path — it turns paragraph-sized SDK text-delta chunks
 *     into per-token object updates that the parser can diff and stream out smoothly.
 *   - Plain text (anything else): forward to `parser.processTextChunk` so intermediate
 *     reasoning like "Let me search..." still reaches the client before a tool call.
 *
 * The JSON buffer and step classification are reset on both `finish-step` (AI SDK v6 per-step
 * event) and `finish` (end of generation). Resetting between steps is load-bearing: without it,
 * step 2's JSON concatenates onto step 1's already-closed JSON, `parsePartialJson` fails, and
 * step 2's content never streams.
 */
export async function processStreamEvents(
  streamResult: StreamTextResult<ToolSet, any>,
  parser: IncrementalStreamParser,
  signal?: AbortSignal,
  structuredOutputMode = false
): Promise<void> {
  let stepMode: StepMode = 'unknown';
  const jsonBuffer: JsonParseState = { buffer: '', lastSnapshot: null };

  const resetStep = () => {
    stepMode = 'unknown';
    jsonBuffer.buffer = '';
    jsonBuffer.lastSnapshot = null;
  };

  for await (const event of streamResult.fullStream) {
    if (signal?.aborted) break;
    switch (event.type) {
      case 'text-delta':
        if (structuredOutputMode) {
          if (stepMode === 'unknown') stepMode = classifyStepMode(event.text);
          if (stepMode === 'json') {
            await accumulateAndEmitJsonDelta(event.text ?? '', jsonBuffer, parser);
            break;
          }
        }
        await parser.processTextChunk(event.text);
        break;
      case 'tool-call':
      case 'tool-result':
        parser.markToolResult();
        break;
      case 'finish-step':
      case 'finish':
        if (event.finishReason === 'tool-calls') parser.markToolResult();
        resetStep();
        break;
      case 'error':
        throw normalizeStreamError(event.error);
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type StepMode = 'unknown' | 'text' | 'json';

interface JsonParseState {
  buffer: string;
  lastSnapshot: string | null;
}

/**
 * Classify the first non-whitespace character of a step's first text-delta. JSON tokens start
 * with `{` (object root) or `[` (array root); anything else is free-form reasoning text.
 * Returns `'unknown'` if the chunk is empty/whitespace so the next chunk decides.
 */
function classifyStepMode(text: string | undefined): StepMode {
  const firstChar = (text ?? '').replace(/^\s+/, '')[0];
  if (!firstChar) return 'unknown';
  return firstChar === '{' || firstChar === '[' ? 'json' : 'text';
}

/**
 * Append a text-delta chunk to the in-progress JSON buffer, repair-parse the cumulative buffer,
 * and forward any new parsed snapshot to the parser. Deduplicates against the last snapshot so
 * chunks that don't advance the parseable state (e.g. whitespace-only) are no-ops.
 */
async function accumulateAndEmitJsonDelta(
  chunk: string,
  state: JsonParseState,
  parser: IncrementalStreamParser
): Promise<void> {
  state.buffer += chunk;
  const { value, state: parseState } = await parsePartialJson(state.buffer);
  if (parseState !== 'successful-parse' && parseState !== 'repaired-parse') return;
  if (!value || typeof value !== 'object') return;

  const snapshot = JSON.stringify(value);
  if (snapshot === state.lastSnapshot) return;
  state.lastSnapshot = snapshot;
  await parser.processObjectDelta(value);
}

/**
 * Consume the SDK's `partialOutputStream` and forward each parsed delta to the parser. Runs in
 * parallel with fullStream consumption as a cooperating source; dedup happens inside the parser.
 */
async function consumePartialOutputStream(
  streamResult: StreamTextResult<ToolSet, any>,
  parser: IncrementalStreamParser,
  signal: AbortSignal
): Promise<void> {
  for await (const delta of streamResult.partialOutputStream) {
    if (signal.aborted) break;
    if (delta) await parser.processObjectDelta(delta);
  }
}

function normalizeStreamError(error: unknown): Error {
  if (error instanceof Error) return error;
  const message =
    (error as { error?: { message?: string } })?.error?.message ??
    JSON.stringify(error) ??
    'Unknown streaming error';
  return new Error(message);
}
