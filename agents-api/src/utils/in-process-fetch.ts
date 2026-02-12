/**
 * In-process fetch transport for internal self-calls.
 *
 * Routes requests through the Hono app's full middleware stack in-process
 * rather than over the network. This guarantees same-instance execution,
 * which is critical for features that rely on process-local state
 * (e.g. the stream helper registry for real-time SSE streaming).
 *
 * Drop-in replacement for `fetch()` — same signature, same return type.
 * Throws in production if the app hasn't been registered.
 * Falls back to global `fetch` in test environments where the full app
 * may not be initialized.
 *
 * **IMPORTANT**: Any code making internal A2A calls or self-referencing API
 * calls within agents-api MUST use `getInProcessFetch()` instead of global
 * `fetch`. Using regular `fetch` for same-service calls causes requests to
 * leave the process and hit the load balancer, which may route them to a
 * different instance — breaking features that depend on process-local state
 * (e.g. stream helper registry, in-memory caches). This only manifests under
 * load in multi-instance deployments and is extremely difficult to debug.
 *
 * @example
 * import { getInProcessFetch } from './utils/in-process-fetch';
 * const response = await getInProcessFetch()(url, init);
 */

import { trace } from '@opentelemetry/api';
import { getLogger } from '../logger';

const logger = getLogger('in-process-fetch');

let _appFetch: typeof fetch | undefined;

export function registerAppFetch(fn: typeof fetch): void {
  _appFetch = fn;
}

export function getInProcessFetch(): typeof fetch {
  if (!_appFetch) {
    if (process.env.ENVIRONMENT === 'test' || process.env.ENVIRONMENT === 'development') {
      return fetch;
    }
    throw new Error(
      '[in-process-fetch] App fetch not registered. Call registerAppFetch() during app initialization before handling requests.'
    );
  }

  const appFetch = _appFetch;
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttribute('http.route.in_process', true);
    }
    logger.debug({ url }, 'Routing request in-process');
    return appFetch(input, init);
  }) as typeof fetch;
}
