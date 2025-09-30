import { createOpenAPI } from 'fumadocs-openapi/server';

// Create separate OpenAPI instances for each API
export const runApiOpenapi = createOpenAPI({
  input: ['./src/lib/run-api.json'],
});

export const manageApiOpenapi = createOpenAPI({
  input: ['./src/lib/manage-api.json'],
});

// Legacy export for backward compatibility (points to manage-api)
export const openapi = manageApiOpenapi;
