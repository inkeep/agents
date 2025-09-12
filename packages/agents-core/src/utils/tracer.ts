import { getTracer } from './tracer-factory';

// Pre-configured tracer for agents-core
export const tracer = getTracer('agents-core');

// Re-export utilities
export { setSpanWithError } from './tracer-factory';
