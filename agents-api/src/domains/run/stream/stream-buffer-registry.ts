import {
  deleteStreamChunks,
  getStreamChunks,
  insertStreamChunks,
  markStreamComplete,
} from '@inkeep/agents-core';
import runDbClient from '../../../data/db/runDbClient';
import { getLogger } from '../../../logger';

const logger = getLogger('stream-buffer-registry');

/** How often the write buffer is flushed to Postgres */
const FLUSH_INTERVAL_MS = 100;
/** How often the readable polls Postgres for new chunks when the local buffer is empty */
const POLL_INTERVAL_MS = 200;
/** Maximum time a readable will poll before giving up (prevents indefinite hangs) */
const MAX_POLL_DURATION_MS = 5 * 60 * 1000;

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
  private decoder = new TextDecoder();

  private static bufferKey(scope: StreamScope): string {
    return `${scope.tenantId}:${scope.projectId}:${scope.conversationId}`;
  }

  register(scope: StreamScope): void {
    const key = PgStreamBufferRegistry.bufferKey(scope);
    const existing = this.writeBuffers.get(key);
    if (existing?.flushTimer) {
      clearInterval(existing.flushTimer);
    }

    deleteStreamChunks(runDbClient)(scope).catch((err) => {
      logger.warn(
        { err, conversationId: scope.conversationId },
        'Failed to clear old stream chunks'
      );
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
        logger.error(
          { err, conversationId: scope.conversationId },
          'Failed to flush stream chunks'
        );
      });
    }, FLUSH_INTERVAL_MS);

    this.writeBuffers.set(key, buffer);
    logger.debug({ conversationId: scope.conversationId }, 'Pg stream buffer registered');
  }

  push(scope: StreamScope, chunk: Uint8Array): void {
    const key = PgStreamBufferRegistry.bufferKey(scope);
    const buffer = this.writeBuffers.get(key);
    if (!buffer || buffer.done) return;

    buffer.pendingChunks.push({
      idx: buffer.nextIdx++,
      data: this.decoder.decode(chunk),
    });
  }

  async complete(scope: StreamScope): Promise<void> {
    const key = PgStreamBufferRegistry.bufferKey(scope);
    const buffer = this.writeBuffers.get(key);
    if (!buffer) return;

    buffer.done = true;
    if (buffer.flushTimer) {
      clearInterval(buffer.flushTimer);
      buffer.flushTimer = null;
    }

    await this.flush(key);

    try {
      await markStreamComplete(runDbClient)({
        ...buffer.scope,
        finalIdx: buffer.nextIdx,
      });
    } catch (err) {
      logger.error(
        { err, conversationId: scope.conversationId },
        'Failed to mark stream complete — resume clients may hang'
      );
    }

    this.writeBuffers.delete(key);
    logger.debug({ conversationId: scope.conversationId }, 'Pg stream buffer completed');
  }

  createReadable(scope: StreamScope, afterIdx = -1): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    let lastIdx = afterIdx;
    let cancelled = false;
    let buffer: { idx: number; data: string; isFinal: boolean }[] = [];
    const pollDeadline = Date.now() + MAX_POLL_DURATION_MS;

    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (cancelled) return;

        try {
          while (buffer.length === 0) {
            if (cancelled) return;
            if (Date.now() > pollDeadline) {
              controller.close();
              return;
            }
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
    try {
      const rows = await getStreamChunks(runDbClient)({
        ...scope,
        afterIdx: -1,
      });
      return rows.length > 0;
    } catch (err) {
      logger.error({ err, ...scope }, 'Failed to check stream chunks, returning false');
      return false;
    }
  }

  private async flush(bufferKey: string): Promise<void> {
    const buffer = this.writeBuffers.get(bufferKey);
    if (!buffer || buffer.pendingChunks.length === 0) return;

    const toFlush = [...buffer.pendingChunks];
    try {
      await insertStreamChunks(runDbClient)({
        ...buffer.scope,
        chunks: toFlush,
      });
      buffer.pendingChunks.splice(0, toFlush.length);
    } catch (err) {
      logger.error(
        { err, conversationId: buffer.scope.conversationId, count: toFlush.length },
        'Failed to insert stream chunks — will retry on next flush'
      );
    }
  }
}

export const streamBufferRegistry = new PgStreamBufferRegistry();
