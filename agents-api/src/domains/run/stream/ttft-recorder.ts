import { performance } from 'node:perf_hooks';
import { SPAN_KEYS } from '@inkeep/agents-core';
import type { Span } from '@opentelemetry/api';
import { getLogger } from '../../../logger';

const logger = getLogger('TtftRecorder');

/**
 * Request-scoped time-to-first-token recorder for a single user→agent interaction.
 *
 * Holds a monotonic t0 captured at request arrival and the interaction-level span
 * (the auto-instrumentation HTTP server span captured via `trace.getActiveSpan()`
 * at handler entry — the only span that wraps all transfer iterations). Each metric
 * is a first-write-wins latch: the first call records `(now - t0)` in seconds onto
 * the interaction span and all later calls are no-ops, so the value is interaction-
 * grained regardless of how many sub-agent generations or transfers occur.
 *
 * Three latches (see spec D4/D9/D10/D11):
 *   - model token  → first raw model token (first `fullStream` text-delta)
 *   - visible token → first user-visible TEXT emit (`StreamHelper.streamText`)
 *   - visible part  → first user-visible emit of ANY kind (text / component /
 *                     artifact / tool card). Hidden tools never reach the
 *                     StreamHelper, so they are excluded for free.
 *
 * Recording is best-effort and side-effect-free: a failure to set a span attribute
 * must never disrupt streaming.
 */
export class TtftRecorder {
  private modelTokenRecorded = false;
  private visibleTokenRecorded = false;
  private visiblePartRecorded = false;

  /**
   * @param t0Ms  monotonic `performance.now()` captured at handler entry
   * @param span  interaction-level span (HTTP server span), or undefined if none is active
   */
  constructor(
    private readonly t0Ms: number,
    private readonly span: Span | undefined
  ) {}

  private elapsedSeconds(): number {
    return (performance.now() - this.t0Ms) / 1000;
  }

  private record(key: string, alreadyRecorded: boolean): boolean {
    if (alreadyRecorded || !this.span) return true;
    try {
      this.span.setAttribute(key, this.elapsedSeconds());
    } catch (err) {
      // Best-effort: never let instrumentation break the stream.
      logger.warn({ err, key }, 'Failed to record TTFT attribute');
    }
    return true;
  }

  /** First raw model token of the interaction. */
  recordModelToken(): void {
    this.modelTokenRecorded = this.record(SPAN_KEYS.TTFT_MODEL_TOKEN, this.modelTokenRecorded);
  }

  /** First user-visible TEXT token of the interaction. */
  recordVisibleToken(): void {
    this.visibleTokenRecorded = this.record(
      SPAN_KEYS.TTFT_VISIBLE_TOKEN,
      this.visibleTokenRecorded
    );
  }

  /** First user-visible emit of any kind (text, component, artifact, tool card). */
  recordVisiblePart(): void {
    this.visiblePartRecorded = this.record(SPAN_KEYS.TTFT_VISIBLE_PART, this.visiblePartRecorded);
  }
}

// ---------------------------------------------------------------------------
// Registry — keyed by requestId, backed by globalThis so it resolves across
// module boundaries (mirrors stream-registry). Lets the model-token latch site
// in the stream-handler resolve the recorder by requestId without parameter
// threading, while the StreamHelper holds it directly for the visible latches.
// ---------------------------------------------------------------------------

const REGISTRY_KEY = '__inkeep_ttftRecorderRegistry';

function getRegistry(): Map<string, TtftRecorder> {
  const g = globalThis as Record<string, unknown>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new Map<string, TtftRecorder>();
  }
  return g[REGISTRY_KEY] as Map<string, TtftRecorder>;
}

export function registerTtftRecorder(requestId: string, recorder: TtftRecorder): void {
  getRegistry().set(requestId, recorder);
}

export function getTtftRecorder(requestId: string): TtftRecorder | undefined {
  return getRegistry().get(requestId);
}

export function unregisterTtftRecorder(requestId: string): void {
  getRegistry().delete(requestId);
}
