import {
  oauthProviderAuthServerMetadata,
  oauthProviderOpenIdConfigMetadata,
} from '@better-auth/oauth-provider';
import { Hono } from 'hono';
import type { AppVariables } from '../../../types/app';

/**
 * Well-known discovery endpoints for OAuth 2.1 / OpenID Connect.
 * These allow clients (like Nango) to auto-discover our OAuth configuration.
 */
const app = new Hono<{ Variables: AppVariables }>();

app.get('/oauth-authorization-server', async (c) => {
  const auth = c.get('auth');
  if (!auth) {
    return c.json({ error: 'Auth not configured' }, 500);
  }
  return oauthProviderAuthServerMetadata(auth)(c.req.raw);
});

app.get('/openid-configuration', async (c) => {
  const auth = c.get('auth');
  if (!auth) {
    return c.json({ error: 'Auth not configured' }, 500);
  }
  return oauthProviderOpenIdConfigMetadata(auth)(c.req.raw);
});

export default app;
