// ============================================================
// src/lib/utils.ts
// Utility functions
// ============================================================

// ============================================================
// Logging
// ============================================================

type LogLevel = 'info' | 'warn' | 'error';

function formatLog(
  level: LogLevel,
  category: string,
  message: string,
  data?: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString();
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  return `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}${dataStr}`;
}

export const log = (cat: string, msg: string, data?: Record<string, unknown>) =>
  console.log(formatLog('info', cat, msg, data));

export const warn = (cat: string, msg: string, data?: Record<string, unknown>) =>
  console.warn(formatLog('warn', cat, msg, data));

export const err = (cat: string, msg: string, data?: Record<string, unknown>) =>
  console.error(formatLog('error', cat, msg, data));

// ============================================================
// Deduplication
// ============================================================

const recentEvents = new Map<string, number>();
const DUPE_WINDOW_MS = 60_000;
const MAX_CACHE_SIZE = 1000;

export function isDupe(eventId: string): boolean {
  const now = Date.now();

  if (recentEvents.size > MAX_CACHE_SIZE) {
    const cutoff = now - DUPE_WINDOW_MS;
    for (const [id, ts] of recentEvents) {
      if (ts < cutoff) recentEvents.delete(id);
    }
  }

  const lastSeen = recentEvents.get(eventId);
  if (lastSeen && now - lastSeen < DUPE_WINDOW_MS) return true;

  recentEvents.set(eventId, now);
  return false;
}

// ============================================================
// Async Utilities
// ============================================================

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const jitter = (baseMs: number): number => {
  const variance = baseMs * 0.25;
  return baseMs + Math.random() * variance * 2 - variance;
};

// ============================================================
// Text Formatting
// ============================================================

export function toSlack(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>') // [text](url) → <url|text>
    .replace(/\*\*([^*]+)\*\*/g, '*$1*') // **bold** → *bold*
    .replace(/__([^_]+)__/g, '*$1*') // __bold__ → *bold*
    .replace(/~~([^~]+)~~/g, '~$1~') // ~~strike~~ → ~strike~
    .replace(/```(\w+)?\n/g, '```\n')
    .trim();
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

// ============================================================
// Date Formatting
// ============================================================

export function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
