import { getTracer } from './tracer-factory';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require.resolve('../../package.json');

// Pre-configured tracer for agents-core
export const tracer = getTracer('agents-core', pkg.version);

// Re-export utilities
export { setSpanWithError } from './tracer-factory';
