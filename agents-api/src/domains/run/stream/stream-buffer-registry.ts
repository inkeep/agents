import {
  deleteStreamChunks,
  getStreamChunks,
  insertStreamChunks,
  markStreamComplete,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const logger = getLogger('stream-buffer-registry');

const FLUSH_INTERVAL_MS = 100;
const POLL_INTERVAL_MS = 200;

interface StreamScope {
  tenantId: string;
  projectId: string;
  conversationId: string;
}

interface WriteBuffer {
  scope: StreamScope;
  pendingChunks: { idx: number; data: string }[];
  nextIdx: number;
  flushTimer: ReturnType<typeof setInterval> | null;
  done: boolean;
}

class PgStreamBufferRegistry {
  private writeBuffers = new Map<string, WriteBuffer>();
  private encoder = new TextDecoder();

  register(scope: StreamScope): void {
    const key = scope.conversationId;
    const existing = this.writeBuffers.get(key);
    if (existing?.flushTimer) {
      clearInterval(existing.flushTimer);
    }

    deleteStreamChunks(runDbClient)(scope).catch((err) => {
      logger.warn({ err, conversationId: key }, 'Failed to clear old stream chunks');
    });

    const buffer: WriteBuffer = {
      scope,
      pendingChunks: [],
      nextIdx: 0,
      flushTimer: null,
      done: false,
    };

    buffer.flushTimer = setInterval(() => {
      this.flush(key).catch((err) => {
        logger.error({ err, conversationId: key }, 'Failed to flush stream chunks');
      });
    }, FLUSH_INTERVAL_MS);

    this.writeBuffers.set(key, buffer);
    logger.debug({ conversationId: key }, 'Pg stream buffer registered');
  }

  push(conversationId: string, chunk: Uint8Array): void {
    const buffer = this.writeBuffers.get(conversationId);
    if (!buffer || buffer.done) return;

    buffer.pendingChunks.push({
      idx: buffer.nextIdx++,
      data: this.encoder.decode(chunk),
    });
  }

  async complete(conversationId: string): Promise<void> {
    const buffer = this.writeBuffers.get(conversationId);
    if (!buffer) return;

    buffer.done = true;
    if (buffer.flushTimer) {
      clearInterval(buffer.flushTimer);
      buffer.flushTimer = null;
    }

    await this.flush(conversationId);

    await markStreamComplete(runDbClient)({
      ...buffer.scope,
      finalIdx: buffer.nextIdx,
    });

    this.writeBuffers.delete(conversationId);
    logger.debug({ conversationId }, 'Pg stream buffer completed');
  }

  createReadable(scope: StreamScope, afterIdx = -1): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let lastIdx = afterIdx;
    let cancelled = false;
    let buffer: { idx: number; data: string; isFinal: boolean }[] = [];

    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (cancelled) return;

        try {
          // Refill buffer from Postgres when empty
          while (buffer.length === 0) {
            if (cancelled) return;
            const rows = await getStreamChunks(runDbClient)({
              ...scope,
              afterIdx: lastIdx,
            });
            if (rows.length > 0) {
              buffer = rows;
            } else {
              await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            }
          }

          // Yield one chunk per pull() for back-pressure
          const row = buffer.shift();
          if (!row) return;
          if (row.isFinal) {
            controller.close();
            return;
          }
          controller.enqueue(encoder.encode(row.data));
          lastIdx = row.idx;
        } catch (err) {
          if (!cancelled) {
            controller.error(err);
          }
        }
      },
      cancel() {
        cancelled = true;
      },
    });
  }

  async hasChunks(scope: StreamScope): Promise<boolean> {
    const rows = await getStreamChunks(runDbClient)({
      ...scope,
      afterIdx: -1,
    });
    return rows.length > 0;
  }

  private async flush(conversationId: string): Promise<void> {
    const buffer = this.writeBuffers.get(conversationId);
    if (!buffer || buffer.pendingChunks.length === 0) return;

    const toFlush = buffer.pendingChunks.splice(0);
    try {
      await insertStreamChunks(runDbClient)({
        ...buffer.scope,
        chunks: toFlush,
      });
    } catch (err) {
      logger.error(
        { err, conversationId, count: toFlush.length },
        'Failed to insert stream chunks'
      );
    }
  }
}

export const streamBufferRegistry = new PgStreamBufferRegistry();
