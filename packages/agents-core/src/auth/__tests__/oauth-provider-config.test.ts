import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { createAuth } from '../auth';

type OAuthProviderOptions = {
  allowDynamicClientRegistration?: boolean;
  allowUnauthenticatedClientRegistration?: boolean;
  resources?: string[];
  enforcePerClientResources?: boolean;
  clientRegistrationDefaultApplicationType?: string;
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

  it('declares the baseURL and the /mcp resource as RFC 8707 resources', () => {
    const options = getOAuthProviderOptions(createAuth(baseConfig));
    expect(options.resources).toEqual([baseURL, `${baseURL}/`, `${baseURL}/mcp`]);
  });

  it('lets every client request every resource, since existing DCR clients have no resource links', () => {
    const options = getOAuthProviderOptions(createAuth(baseConfig));
    expect(options.enforcePerClientResources).toBe(false);
  });

  it('treats DCR clients with loopback redirects and no application_type as native apps', () => {
    const options = getOAuthProviderOptions(createAuth(baseConfig));
    expect(options.clientRegistrationDefaultApplicationType).toBe('infer');
  });

  it('tracks the baseURL passed to createAuth when it differs from the default', () => {
    const customBaseURL = 'https://api.example.com';
    const options = getOAuthProviderOptions(createAuth({ ...baseConfig, baseURL: customBaseURL }));
    expect(options.resources).toEqual([customBaseURL, `${customBaseURL}/`, `${customBaseURL}/mcp`]);
  });
});
