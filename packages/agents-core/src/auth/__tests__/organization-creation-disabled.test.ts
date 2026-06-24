import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { createAuth } from '../auth';

type OrganizationPluginOptions = {
  allowUserToCreateOrganization?: boolean | ((...args: unknown[]) => unknown);
};

function getOrganizationPluginOptions(
  auth: ReturnType<typeof createAuth>
): OrganizationPluginOptions {
  const plugins = (
    auth as unknown as {
      options: { plugins: Array<{ id: string; options?: OrganizationPluginOptions }> };
    }
  ).options.plugins;
  const plugin = plugins.find((p) => p.id === 'organization');
  if (!plugin?.options) {
    throw new Error('organization plugin not registered');
  }
  return plugin.options;
}

describe('createAuth organization-creation policy', () => {
  const baseConfig = {
    baseURL: 'http://localhost:3002',
    secret: 'test-secret-test-secret-test-secret',
    dbClient: testRunDbClient,
  };

  // Regression: organization creation must stay disabled at the auth layer.
  it('disables self-service organization creation', () => {
    const options = getOrganizationPluginOptions(createAuth(baseConfig));
    expect(options.allowUserToCreateOrganization).toBe(false);
  });
});

describe('dash organization-create endpoint gating', () => {
  const auth = createAuth({
    baseURL: 'http://localhost:3002',
    secret: 'test-secret-test-secret-test-secret',
    dbClient: testRunDbClient,
  });

  // The dash() plugin's /dash/organization/create endpoint does not consult
  // allowUserToCreateOrganization; it is gated by the BETTER_AUTH_API_KEY
  // service-secret JWT handshake. Callers without that credential must be rejected.
  async function postDashCreate(headers: Record<string, string>) {
    return auth.handler(
      new Request('http://localhost:3002/api/auth/dash/organization/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ name: 'x', slug: 'x', userId: 'x' }),
      })
    );
  }

  it('rejects /dash/organization/create without a credential', async () => {
    const response = await postDashCreate({});
    expect(response.status).toBe(401);
  });

  it('rejects /dash/organization/create with a bogus bearer token', async () => {
    const response = await postDashCreate({ Authorization: 'Bearer not-a-valid-jwt' });
    expect(response.status).toBe(401);
  });
});
