import { getLogger } from './logger';

const logger = getLogger('wait-until');

let _waitUntil: ((promise: Promise<unknown>) => void) | undefined;
let _waitUntilResolved = false;

/**
 * Lazy-load and cache Vercel's `waitUntil` function.
 *
 * - On Vercel (`process.env.VERCEL` set): dynamically imports `@vercel/functions`
 *   and returns `waitUntil`, which extends the serverless function lifetime
 *   past the HTTP response so background work can complete.
 * - Outside Vercel: returns `undefined`. Callers should let the promise
 *   execute naturally via the Node.js event loop (fire-and-forget with
 *   error handling).
 * - Import failure: logs a warning and returns `undefined` (graceful degradation).
 * - Result is cached after first call (lazy singleton).
 */
export async function getWaitUntil(): Promise<((promise: Promise<unknown>) => void) | undefined> {
  if (_waitUntilResolved) return _waitUntil;
  _waitUntilResolved = true;
  if (!process.env.VERCEL) return undefined;
  try {
    const mod = await import('@vercel/functions');
    _waitUntil = mod.waitUntil;
  } catch (e) {
    logger.warn({ error: e }, 'Failed to import @vercel/functions, waitUntil unavailable');
  }
  return _waitUntil;
}

/**
 * Reset internal cache. Exposed only for testing.
 */
export function _resetWaitUntilCache(): void {
  _waitUntil = undefined;
  _waitUntilResolved = false;
}
