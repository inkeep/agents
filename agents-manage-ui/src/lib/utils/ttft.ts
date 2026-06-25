/**
 * Time-to-first-token (TTFT) display policy: formatting, qualitative banding, and
 * band colors. Single source of truth for how TTFT is presented in the UI — the
 * telemetry attribute keys live in `@inkeep/agents-core` (SPAN_KEYS.TTFT_*); the
 * presentation decisions (what counts as fast/slow, what color) live here.
 */

/**
 * Absolute band thresholds, in seconds. These are a v1 heuristic tuned for
 * agent interactions (which often run retrieval/tool calls before answering),
 * not raw LLM chat. The longer-term goal is a relative, per-agent baseline.
 */
export const TTFT_FAST_MAX_SECONDS = 3; // < 3s → fast
export const TTFT_MODERATE_MAX_SECONDS = 6; // 3–6s → moderate; > 6s → slow

export type TtftQuality = 'fast' | 'moderate' | 'slow';

/**
 * Parse a raw TTFT attribute value (in SECONDS) read off a SigNoz span row into a
 * present-or-absent number. SigNoz/ClickHouse returns 0 (not null) for a numeric
 * attribute a span does not have, so a plain presence check matches every span and
 * reads 0 off the wrong one. A real first-token time is always > 0, so only a finite
 * positive value counts as present; everything else (0, negative, NaN, non-numeric,
 * missing) is absent → null. This is the guard behind the "0 ms TTFT" fix.
 */
export function parseTtftSeconds(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Format a TTFT value, stored in SECONDS, for display. Sub-second values render in
 * milliseconds ("812 ms"); larger values render in seconds with one decimal ("1.4 s").
 * Returns an em dash for missing/invalid values.
 */
export function formatTtft(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const ms = seconds * 1000;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${seconds.toFixed(1)} s`;
}

/**
 * Qualitative responsiveness band for a TTFT value in SECONDS. Returns null for
 * missing/invalid values (so callers can omit the badge).
 */
export function ttftQuality(seconds: number | null | undefined): TtftQuality | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < TTFT_FAST_MAX_SECONDS) return 'fast';
  if (seconds <= TTFT_MODERATE_MAX_SECONDS) return 'moderate';
  return 'slow';
}

/** Tailwind text + border classes for a TTFT quality band (used on outline badges). */
export function ttftQualityClasses(quality: TtftQuality): string {
  switch (quality) {
    case 'fast':
      return 'text-green-600 border-green-600';
    case 'moderate':
      return 'text-yellow-600 border-yellow-600';
    case 'slow':
      return 'text-red-600 border-red-600';
  }
}
