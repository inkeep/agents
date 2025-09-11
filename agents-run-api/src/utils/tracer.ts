import { getTracer } from '@inkeep/agents-core';
const pkg = require("../../package.json");

// Pre-configured tracer for agents-run-api
export const tracer = getTracer('agents-run-api', pkg.version);

export { setSpanWithError } from '@inkeep/agents-core';
