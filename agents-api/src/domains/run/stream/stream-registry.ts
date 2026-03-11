import type { StreamHelper } from './stream-helpers';

const REGISTRY_KEY = '__inkeep_streamHelperRegistry';

/**
 * Global registry for StreamHelper instances backed by globalThis so it is
 * shared across module boundaries (e.g. the WDK workflow bundle and the main
 * Hono app bundle both resolve to the same Map).
 */
function getRegistry(): Map<string, StreamHelper> {
  const g = globalThis as Record<string, unknown>;
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new Map<string, StreamHelper>();
  }
  return g[REGISTRY_KEY] as Map<string, StreamHelper>;
}

/**
 * Register a StreamHelper for a specific request ID
 */
export function registerStreamHelper(requestId: string, streamHelper: StreamHelper): void {
  getRegistry().set(requestId, streamHelper);
}

/**
 * Get a StreamHelper by request ID
 */
export function getStreamHelper(requestId: string): StreamHelper | undefined {
  return getRegistry().get(requestId);
}

/**
 * Unregister a StreamHelper for a specific request ID
 */
export function unregisterStreamHelper(requestId: string): void {
  getRegistry().delete(requestId);
}

/**
 * Get registry size (for debugging)
 */
export function getRegistrySize(): number {
  return getRegistry().size;
}
