import type { StreamHelper } from './stream-helpers';

/**
 * Global registry for StreamHelper instances
 * Allows agents to access streamHelper via requestId across A2A boundaries
 */
const streamHelperRegistry = new Map<string, StreamHelper>();

/**
 * Register a StreamHelper for a specific request ID
 */
export function registerStreamHelper(requestId: string, streamHelper: StreamHelper): void {
  streamHelperRegistry.set(requestId, streamHelper);
}

/**
 * Get a StreamHelper by request ID
 */
export function getStreamHelper(requestId: string): StreamHelper | undefined {
  return streamHelperRegistry.get(requestId);
}

/**
 * Unregister a StreamHelper for a specific request ID
 */
export function unregisterStreamHelper(requestId: string): void {
  streamHelperRegistry.delete(requestId);
}

/**
 * Get registry size (for debugging)
 */
export function getRegistrySize(): number {
  return streamHelperRegistry.size;
}
