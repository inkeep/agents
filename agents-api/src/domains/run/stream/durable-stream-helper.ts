import type { HonoSSEStream, VercelUIWriter } from './stream-helpers';

const encoder = new TextEncoder();

/**
 * A HonoSSEStream adapter that writes SSE-formatted data to a WDK WritableStream.
 * Used during durable workflow execution so SSE events are persisted and
 * clients can reconnect via getRun(runId).readable.
 */
export class WritableBackedHonoSSEStream implements HonoSSEStream {
  private writer: WritableStreamDefaultWriter<Uint8Array>;

  constructor(writable: WritableStream<Uint8Array>) {
    this.writer = writable.getWriter();
  }

  async writeSSE(message: { data: string; event?: string; id?: string }): Promise<void> {
    let text = '';
    if (message.event) text += `event: ${message.event}\n`;
    if (message.id) text += `id: ${message.id}\n`;
    text += `data: ${message.data}\n\n`;
    await this.writer.write(encoder.encode(text));
  }

  async sleep(ms: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  async close(): Promise<void> {
    try {
      await this.writer.close();
    } catch {
      // Writer may already be closed
    }
  }

  releaseLock(): void {
    this.writer.releaseLock();
  }
}

/**
 * A VercelUIWriter adapter that writes Vercel data stream SSE events to a WDK WritableStream.
 * Used during durable workflow execution via the /chat endpoint so the Vercel AI SDK client
 * can consume the stream directly.
 */
export class WritableBackedVercelWriter implements VercelUIWriter {
  private writer: WritableStreamDefaultWriter<Uint8Array>;

  constructor(writable: WritableStream<Uint8Array>) {
    this.writer = writable.getWriter();
  }

  write(chunk: unknown): void {
    const bytes = encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`);
    this.writer.write(bytes).catch(() => {});
  }

  merge(_stream: unknown): void {
    // Not supported in durable context
  }

  async close(): Promise<void> {
    try {
      await this.writer.close();
    } catch {
      // Writer may already be closed
    }
  }
}
