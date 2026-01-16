import { getTracer } from '@inkeep/agents-core';

// Pre-configured tracer for agents-run-api
export const tracer = getTracer('agents-run-api');

export { setSpanWithError } from '@inkeep/agents-core';
