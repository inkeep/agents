import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { createAuth } from '../auth';

type OAuthProviderOptions = {
  allowDynamicClientRegistration?: boolean;
  allowUnauthenticatedClientRegistration?: boolean;
  validAudiences?: string[];
};

function getOAuthProviderOptions(auth: ReturnType<typeof createAuth>): OAuthProviderOptions {
  const plugins = (
    auth as unknown as {
      options: { plugins: Array<{ id: string; options?: OAuthProviderOptions }> };
    }
  ).options.plugins;
  const plugin = plugins.find((p) => p.id === 'oauth-provider');
  if (!plugin?.options) {
    throw new Error('oauth-provider plugin not registered');
  }
  return plugin.options;
}

describe('createAuth oauth-provider configuration', () => {
  const baseURL = 'http://localhost:3002';
  const baseConfig = {
    baseURL,
    secret: 'test-secret-test-secret-test-secret',
    dbClient: testRunDbClient,
  };

  it('enables dynamic client registration so MCP clients can self-register', () => {
    const options = getOAuthProviderOptions(createAuth(baseConfig));
    expect(options.allowDynamicClientRegistration).toBe(true);
  });

  it('allows unauthenticated DCR so public MCP clients can register without credentials', () => {
    const options = getOAuthProviderOptions(createAuth(baseConfig));
    expect(options.allowUnauthenticatedClientRegistration).toBe(true);
  });

  it('declares the baseURL and the /mcp resource as valid audiences for RFC 8707 resource binding', () => {
    const options = getOAuthProviderOptions(createAuth(baseConfig));
    expect(options.validAudiences).toEqual([baseURL, `${baseURL}/`, `${baseURL}/mcp`]);
  });

  it('tracks the baseURL passed to createAuth when it differs from the default', () => {
    const customBaseURL = 'https://api.example.com';
    const options = getOAuthProviderOptions(createAuth({ ...baseConfig, baseURL: customBaseURL }));
    expect(options.validAudiences).toEqual([
      customBaseURL,
      `${customBaseURL}/`,
      `${customBaseURL}/mcp`,
    ]);
  });
});
