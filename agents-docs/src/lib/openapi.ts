import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  // the OpenAPI schema, you can also give it an external URL.
  input: () => ({
    index: 'https://agents-manage-api.preview.inkeep.com/openapi.json',
    'run-api': 'https://agents-run-api.preview.inkeep.com/openapi.json',
  }),
});
