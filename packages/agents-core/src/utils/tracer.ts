import { getTracer } from './tracer-factory';
const pkg = require("../../package.json"); 

// Pre-configured tracer for agents-core
export const tracer = getTracer('agents-core', pkg.version);

// Re-export utilities
export { setSpanWithError } from './tracer-factory';
