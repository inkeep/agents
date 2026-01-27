import { createOpenAPI } from 'fumadocs-openapi/server';

export const openapi = createOpenAPI({
  proxyUrl: '/api/proxy',
  // the OpenAPI schema, you can also give it an external URL.
  async input() {
    const { default: json } = await import('../../../agents-api/__snapshots__/openapi.json', {
      with: {
        type: 'json',
      },
    });
    return {
      index: {
        ...json,
        servers: [
          {
            description: 'API Server',
            url: 'https://api.pilot.inkeep.com',
          },
        ],
      },
    };
  },
});
