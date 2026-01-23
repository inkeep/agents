// ============================================================
// src/lib/inkeep.ts
// Inkeep API client with streaming support
// ============================================================

import { getEnv, STREAM_CONFIG } from './env';
import { err, jitter, sleep } from './utils';

// ============================================================
// Types
// ============================================================

type StreamStage = 'thinking' | 'connecting' | 'streaming' | 'finalizing' | 'retrying' | 'error';

type OnDeltaCallback = (fullText: string) => void | Promise<void>;
type OnStageCallback = (stage: StreamStage, text: string) => void;

// ============================================================
// Constants
// ============================================================

const STAGE_TEXT = {
  connecting: '🔄 Connecting to agent...',
  streaming: '✍️ Writing response...',
  retrying: (n: number, max: number) => `🔄 Retrying (${n}/${max})...`,
};

// ============================================================
// SSE Stream Reader
// ============================================================

async function readSseStream(response: Response, onDelta?: OnDeltaCallback): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No body reader');

  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() ?? '';

      for (const raw of parts) {
        const line = raw.trimEnd();
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6);
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed?.type === 'text-delta' && parsed.delta) {
            fullText += parsed.delta;
            await onDelta?.(fullText);
          }
        } catch {
          // Ignore parse errors for partial JSON
        }
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // Ignore release errors
    }
  }

  return fullText;
}

// ============================================================
// Single Request
// ============================================================

async function streamOnce(
  question: string,
  conversationId: string,
  projectId: string,
  agentId: string,
  onDelta?: OnDeltaCallback,
  onStage?: OnStageCallback
): Promise<string> {
  const env = getEnv();

  onStage?.('connecting', STAGE_TEXT.connecting);

  const res = await fetch(`${env.INKEEP_API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.INKEEP_API_SECRET}`,
      'Content-Type': 'application/json',
      'x-inkeep-tenant-id': env.INKEEP_TENANT_ID,
      'x-inkeep-project-id': projectId,
      'x-inkeep-agent-id': agentId,
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: question }],
      conversationId,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    err('inkeep', 'API error', { status: res.status, body: body.slice(0, 400) });
    throw new Error(`Inkeep API error: ${res.status}`);
  }

  onStage?.('streaming', STAGE_TEXT.streaming);
  const fullText = await readSseStream(res, onDelta);

  return fullText || "Sorry, I couldn't generate a response.";
}

// ============================================================
// Public API
// ============================================================

/**
 * Ask Inkeep a question with streaming response
 *
 * @param question - The user's question
 * @param conversationId - Unique ID for conversation continuity
 * @param projectId - Inkeep project ID
 * @param agentId - Inkeep agent ID
 * @param onDelta - Callback fired as text streams in (for live updates)
 * @param onStage - Callback for stage changes (connecting, streaming, etc.)
 * @returns Full response text
 */
export async function askInkeep(
  question: string,
  conversationId: string,
  projectId: string,
  agentId: string,
  onDelta?: OnDeltaCallback,
  onStage?: OnStageCallback
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= STREAM_CONFIG.maxRetries + 1; attempt++) {
    try {
      if (attempt > 1) {
        onStage?.('retrying', STAGE_TEXT.retrying(attempt - 1, STREAM_CONFIG.maxRetries));
        await sleep(jitter(STREAM_CONFIG.baseRetryDelayMs * attempt));
      }
      return await streamOnce(question, conversationId, projectId, agentId, onDelta, onStage);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      err('inkeep', 'Attempt failed', { attempt, msg: lastError.message });

      // Don't retry auth errors
      if (lastError.message.includes('401') || lastError.message.includes('403')) {
        break;
      }
    }
  }

  throw lastError || new Error('Inkeep streaming failed');
}
