import { APIError } from 'better-auth/api';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { discoverMock, queryByIdMock, MockDiscoveryError } = vi.hoisted(() => ({
  discoverMock: vi.fn(),
  queryByIdMock: vi.fn(),
  MockDiscoveryError: class DiscoveryError extends Error {},
}));

vi.mock('@better-auth/sso', () => ({
  discoverOIDCConfig: (...args: unknown[]) => discoverMock(...args),
  DiscoveryError: MockDiscoveryError,
}));

vi.mock('../../data-access/runtime/auth', () => ({
  querySsoProviderById: () => queryByIdMock,
}));

import { maybeRediscoverSsoIssuer } from '../sso-issuer-discovery';

const dbClient = {} as never;

const HYDRATED = {
  issuer: 'https://new.example.com',
  discoveryEndpoint: 'https://new.example.com/.well-known/openid-configuration',
  authorizationEndpoint: 'https://new.example.com/authorize',
  tokenEndpoint: 'https://new.example.com/token',
  jwksEndpoint: 'https://new.example.com/jwks',
  userInfoEndpoint: 'https://new.example.com/userinfo',
  tokenEndpointAuthentication: 'client_secret_post' as const,
};

function makeCtx(body: unknown, path = '/sso/update-provider', isTrustedOrigin = () => true) {
  return { path, body, context: { isTrustedOrigin } } as never;
}

describe('maybeRediscoverSsoIssuer', () => {
  beforeEach(() => {
    discoverMock.mockReset();
    queryByIdMock.mockReset();
  });

  it('is a no-op for non-update paths', async () => {
    const result = await maybeRediscoverSsoIssuer(
      makeCtx({ providerId: 'p', issuer: 'https://new.example.com' }, '/sso/register'),
      dbClient
    );
    expect(result).toBeUndefined();
    expect(queryByIdMock).not.toHaveBeenCalled();
  });

  it('is a no-op when providerId or issuer is missing', async () => {
    expect(
      await maybeRediscoverSsoIssuer(makeCtx({ issuer: 'https://x' }), dbClient)
    ).toBeUndefined();
    expect(await maybeRediscoverSsoIssuer(makeCtx({ providerId: 'p' }), dbClient)).toBeUndefined();
    expect(queryByIdMock).not.toHaveBeenCalled();
  });

  it('is a no-op when the issuer is unchanged (ignoring a trailing slash)', async () => {
    queryByIdMock.mockResolvedValue({ issuer: 'https://idp.example.com/' });
    const result = await maybeRediscoverSsoIssuer(
      makeCtx({ providerId: 'p', issuer: 'https://idp.example.com' }),
      dbClient
    );
    expect(result).toBeUndefined();
    expect(discoverMock).not.toHaveBeenCalled();
  });

  it('is a no-op when the provider cannot be read', async () => {
    queryByIdMock.mockResolvedValue(undefined);
    const result = await maybeRediscoverSsoIssuer(
      makeCtx({ providerId: 'p', issuer: 'https://new.example.com' }),
      dbClient
    );
    expect(result).toBeUndefined();
    expect(discoverMock).not.toHaveBeenCalled();
  });

  it('injects freshly discovered endpoints when the issuer changes', async () => {
    queryByIdMock.mockResolvedValue({ issuer: 'https://old.example.com' });
    discoverMock.mockResolvedValue(HYDRATED);

    const result = await maybeRediscoverSsoIssuer(
      makeCtx({ providerId: 'p', issuer: 'https://new.example.com' }),
      dbClient
    );

    expect(result).toEqual({
      context: {
        body: {
          oidcConfig: {
            discoveryEndpoint: HYDRATED.discoveryEndpoint,
            authorizationEndpoint: HYDRATED.authorizationEndpoint,
            tokenEndpoint: HYDRATED.tokenEndpoint,
            jwksEndpoint: HYDRATED.jwksEndpoint,
            userInfoEndpoint: HYDRATED.userInfoEndpoint,
            tokenEndpointAuthentication: HYDRATED.tokenEndpointAuthentication,
          },
        },
      },
    });
    expect(discoverMock).toHaveBeenCalledWith(
      expect.objectContaining({ issuer: 'https://new.example.com' })
    );
  });

  it('trusts the new issuer origin (and only that) for the discovery fetch', async () => {
    queryByIdMock.mockResolvedValue({ issuer: 'https://old.example.com' });
    discoverMock.mockResolvedValue(HYDRATED);

    await maybeRediscoverSsoIssuer(
      makeCtx(
        { providerId: 'p', issuer: 'https://new.example.com' },
        '/sso/update-provider',
        () => false
      ),
      dbClient
    );

    const isTrustedOrigin = discoverMock.mock.calls[0][0].isTrustedOrigin as (u: string) => boolean;
    expect(isTrustedOrigin('https://new.example.com/authorize')).toBe(true);
    expect(isTrustedOrigin('https://evil.example.com/authorize')).toBe(false);
  });

  it('omits optional endpoints that discovery did not return', async () => {
    queryByIdMock.mockResolvedValue({ issuer: 'https://old.example.com' });
    discoverMock.mockResolvedValue({
      ...HYDRATED,
      userInfoEndpoint: undefined,
      tokenEndpointAuthentication: undefined,
    });

    const result = await maybeRediscoverSsoIssuer(
      makeCtx({ providerId: 'p', issuer: 'https://new.example.com' }),
      dbClient
    );

    expect(result?.context.body.oidcConfig).not.toHaveProperty('userInfoEndpoint');
    expect(result?.context.body.oidcConfig).not.toHaveProperty('tokenEndpointAuthentication');
  });

  it('raises a BAD_REQUEST APIError (with the discovery message) when discovery fails', async () => {
    queryByIdMock.mockResolvedValue({ issuer: 'https://old.example.com' });
    discoverMock.mockRejectedValue(new MockDiscoveryError('issuer unreachable'));

    await expect(
      maybeRediscoverSsoIssuer(
        makeCtx({ providerId: 'p', issuer: 'https://new.example.com' }),
        dbClient
      )
    ).rejects.toBeInstanceOf(APIError);
    await expect(
      maybeRediscoverSsoIssuer(
        makeCtx({ providerId: 'p', issuer: 'https://new.example.com' }),
        dbClient
      )
    ).rejects.toThrow(/issuer unreachable/);
  });

  it('raises BAD_REQUEST without leaking the internal message for non-DiscoveryError failures', async () => {
    queryByIdMock.mockResolvedValue({ issuer: 'https://old.example.com' });
    discoverMock.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:443'));

    const promise = maybeRediscoverSsoIssuer(
      makeCtx({ providerId: 'p', issuer: 'https://new.example.com' }),
      dbClient
    );
    await expect(promise).rejects.toBeInstanceOf(APIError);
    await expect(promise).rejects.toThrow(/OIDC discovery failed for the new issuer/);
    await expect(promise).rejects.not.toThrow(/ECONNREFUSED/);
  });

  it('falls through (no-op) when the provider lookup throws, never blocking the edit', async () => {
    queryByIdMock.mockRejectedValue(new Error('db unavailable'));

    const result = await maybeRediscoverSsoIssuer(
      makeCtx({ providerId: 'p', issuer: 'https://new.example.com' }),
      dbClient
    );

    expect(result).toBeUndefined();
    expect(discoverMock).not.toHaveBeenCalled();
  });
});
