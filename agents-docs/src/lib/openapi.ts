import { createOpenAPI } from 'fumadocs-openapi/server';

const API_URL =
  process.env.NODE_ENV === 'production' ? 'https://api.pilot.inkeep.com' : 'http://localhost:3002';

export const openapi = createOpenAPI({
  // the OpenAPI schema, you can also give it an external URL.
  input: () => ({
    index: `${API_URL}/openapi.json`,
  }),
});
