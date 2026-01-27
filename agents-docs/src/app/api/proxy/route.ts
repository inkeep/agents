import { openapi } from '@/lib/openapi';

/**
 * @see https://fumadocs.dev/docs/integrations/openapi/server#setup
 */
export const { GET, HEAD, PUT, POST, PATCH, DELETE } = openapi.createProxy({
  // optional, we recommend to set a list of allowed origins for proxied requests
  allowedOrigins: ['https://docs.inkeep.com'],
});
