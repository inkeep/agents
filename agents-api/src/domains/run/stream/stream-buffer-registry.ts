import EventEmitter from 'node:events';
import { getLogger } from '../../../logger';

interface BufferEntry {
  chunks: Uint8Array[];
  done: boolean;
  emitter: EventEmitter;
  timeoutId?: ReturnType<typeof setTimeout>;
}

const CLEANUP_DELAY_MS = 60_000;
const REGISTRY_KEY = '__inkeep_streamBufferRegistry';
const logger = getLogger('stream-buffer-registry');

function getBufferMap(): Map<string, BufferEntry> {
  const g = globalThis as Record<string, unknown>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new Map<string, BufferEntry>();
  }
  return g[REGISTRY_KEY] as Map<string, BufferEntry>;
}

class StreamBufferRegistry {
  private get buffers() {
    return getBufferMap();
  }

  register(conversationId: string): void {
    const existing = this.buffers.get(conversationId);
    if (existing) {
      if (existing.timeoutId) clearTimeout(existing.timeoutId);
      if (!existing.done) {
        existing.done = true;
        existing.emitter.emit('done');
      }
    }
    this.buffers.set(conversationId, {
      chunks: [],
      done: false,
      emitter: new EventEmitter(),
    });
    logger.debug({ conversationId }, 'Stream buffer registered for resumption');
  }

  push(conversationId: string, chunk: Uint8Array): void {
    const entry = this.buffers.get(conversationId);
    if (!entry || entry.done) return;
    entry.chunks.push(chunk);
    entry.emitter.emit('chunk', chunk);
  }

  complete(conversationId: string): void {
    const entry = this.buffers.get(conversationId);
    if (!entry) return;
    entry.done = true;
    entry.emitter.emit('done');
    entry.timeoutId = setTimeout(() => {
      this.buffers.delete(conversationId);
    }, CLEANUP_DELAY_MS);
  }

  createReadable(conversationId: string): ReadableStream<Uint8Array> | null {
    const entry = this.buffers.get(conversationId);
    logger.debug({ conversationId, found: !!entry }, 'Stream buffer createReadable');
    if (!entry) return null;

    let onChunk: ((chunk: Uint8Array) => void) | null = null;
    let onDone: (() => void) | null = null;

    return new ReadableStream<Uint8Array>({
      start(controller) {
        onChunk = (chunk: Uint8Array) => controller.enqueue(chunk);
        onDone = () => {
          if (onChunk) entry.emitter.off('chunk', onChunk);
          if (onDone) entry.emitter.off('done', onDone);
          onChunk = null;
          onDone = null;
          controller.close();
        };

        entry.emitter.on('chunk', onChunk);
        entry.emitter.on('done', onDone);

        for (const chunk of entry.chunks) {
          controller.enqueue(chunk);
        }

        if (entry.done) {
          onDone();
        }
      },
      cancel() {
        if (onChunk) entry.emitter.off('chunk', onChunk);
        if (onDone) entry.emitter.off('done', onDone);
        onChunk = null;
        onDone = null;
      },
    });
  }

  has(conversationId: string): boolean {
    return this.buffers.has(conversationId);
  }
}

export const streamBufferRegistry = new StreamBufferRegistry();
