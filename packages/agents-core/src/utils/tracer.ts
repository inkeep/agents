import { getTracer } from './tracer-factory';

// Use require for package.json to avoid import assertion issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = { version: '0.1.5' }; // Hard-coded version to avoid import assertion issues

// Pre-configured tracer for agents-core
export const tracer = getTracer('agents-core', pkg.version);

// Re-export utilities
export { setSpanWithError } from './tracer-factory';
