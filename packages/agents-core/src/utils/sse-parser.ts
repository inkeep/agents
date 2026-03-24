/**
 * SSE (Server-Sent Events) Response Parser
 *
 * Shared utility for parsing SSE responses from the chat API.
 * Used by EvaluationService, Slack integration, and other consumers.
 *
 * Handles multiple response formats:
 * - OpenAI-compatible chat completion chunks
 * - Vercel AI SDK data stream format (text-delta)
 * - Error operations and events
 */

export interface ParsedSSEResponse {
  text: string;
  error?: string;
}

/**
 * Parse SSE (Server-Sent Events) response from chat API
 * Handles text deltas, error operations, and other data operations
 *
 * Supports:
 * - OpenAI-compatible format: `chat.completion.chunk` with `delta.content`
 * - Vercel AI SDK format: `text-delta` with `delta`
 * - Vercel AI SDK format: `text-start` and `text-end` markers (ignored)
 * - Error operations: `data-operation` with `type: 'error'`
 * - Direct error events: `type: 'error'`
 *
 * Ignores:
 * - `data-operation` events (metadata, not content)
 * - `text-start` and `text-end` markers
 * - `[DONE]` markers
 */
export function parseSSEResponse(sseText: string): ParsedSSEResponse {
  let textContent = '';
  let hasError = false;
  let errorMessage = '';

  const lines = sseText.split('\n').filter((line) => line.startsWith('data: '));

  for (const line of lines) {
    const jsonStr = line.slice(6).trim();

    if (!jsonStr || jsonStr === '[DONE]') {
      continue;
    }

    try {
      const data = JSON.parse(jsonStr);

      if (data.object === 'chat.completion.chunk' && data.choices?.[0]?.delta) {
        const delta = data.choices[0].delta;

        if (delta.content && typeof delta.content === 'string') {
          try {
            const parsedContent = JSON.parse(delta.content);
            if (parsedContent.type === 'data-operation') {
              if (parsedContent.data?.type === 'error') {
                hasError = true;
                errorMessage = parsedContent.data.message || 'Unknown error occurred';
              }
              continue;
            }
            textContent += delta.content;
          } catch {
            textContent += delta.content;
          }
        }
        continue;
      }

      if (data.type === 'text-delta' && data.delta) {
        textContent += data.delta;
        continue;
      }

      if (data.type === 'text-start' || data.type === 'text-end') {
        continue;
      }

      if (data.type === 'data-operation') {
        if (data.data?.type === 'error') {
          hasError = true;
          errorMessage = data.data.message || 'Unknown error occurred';
        }
        continue;
      }

      if (data.type === 'error') {
        hasError = true;
        errorMessage = data.message || 'Unknown error occurred';
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  if (hasError) {
    return { text: textContent.trim(), error: errorMessage };
  }

  return { text: textContent.trim() };
}
