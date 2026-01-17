import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  // the OpenAPI schema, you can also give it an external URL.
  input: () => ({
    index:
      'https://raw.githubusercontent.com/inkeep/agents/b1662340abdb842477389c13f22382a54c1ede75/agents-docs/src/lib/index.json',
    // TODO: Re-enable when preview API is stable
    // 'run-api': 'https://agents-run-api.preview.inkeep.com/openapi.json',
  }),
});
