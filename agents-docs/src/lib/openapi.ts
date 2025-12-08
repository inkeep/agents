import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  // the OpenAPI schema, you can also give it an external URL.
  input: () => ({
    index: 'https://github.com/inkeep/agents/blob/b1662340abdb842477389c13f22382a54c1ede75/agents-docs/src/lib/index.json',
    'run-api': 'https://agents-run-api.preview.inkeep.com/openapi.json',
  }),
});
