/**
 * In-process fetch transport for internal self-calls.
 *
 * Routes requests through the Hono app's full middleware stack in-process
 * rather than over the network. This guarantees same-instance execution,
 * which is critical for features that rely on process-local state
 * (e.g. the stream helper registry for real-time SSE streaming).
 *
 * Drop-in replacement for `fetch()` — same signature, same return type.
 * Falls back to global `fetch` if the app hasn't been registered yet.
 *
 * @example
 * import { getInProcessFetch } from './utils/in-process-fetch';
 * const response = await getInProcessFetch()(url, init);
 */

let _appFetch: typeof fetch | undefined;

export function registerAppFetch(fn: typeof fetch): void {
  _appFetch = fn;
}

export function getInProcessFetch(): typeof fetch {
  return _appFetch ?? fetch;
}
