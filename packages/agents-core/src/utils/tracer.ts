import { getTracer } from './tracer-factory';

// Import package.json using require() to avoid import assertion syntax
const pkg = require('../../package.json');

// Pre-configured tracer for agents-core
export const tracer = getTracer('agents-core', pkg.version);

// Re-export utilities
export { setSpanWithError } from './tracer-factory';
