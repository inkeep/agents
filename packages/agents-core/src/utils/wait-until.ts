import { getLogger } from './logger';

const logger = getLogger('wait-until');

type WaitUntilFn = (promise: Promise<unknown>) => void;

let _importPromise: Promise<WaitUntilFn | undefined> | undefined;

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
 * - Result is cached after first call (lazy singleton). Concurrent callers
 *   share the same import promise to avoid duplicate imports.
 */
export async function getWaitUntil(): Promise<WaitUntilFn | undefined> {
  if (_importPromise) return _importPromise;
  _importPromise = (async () => {
    if (!process.env.VERCEL) return undefined;
    try {
      const mod = await import('@vercel/functions');
      return mod.waitUntil;
    } catch (e) {
      logger.warn({ error: e }, 'Failed to import @vercel/functions, waitUntil unavailable');
      return undefined;
    }
  })();
  return _importPromise;
}

/**
 * Reset internal cache. Exposed only for testing.
 */
export function _resetWaitUntilCache(): void {
  _importPromise = undefined;
}
