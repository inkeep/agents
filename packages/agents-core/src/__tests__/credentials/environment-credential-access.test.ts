import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TemplateEngine } from '../../context/TemplateEngine';
import { CredentialStoreRegistry } from '../../credential-stores/CredentialStoreRegistry';
import { createDefaultCredentialStores } from '../../credential-stores/defaults';
import { InMemoryCredentialStore } from '../../credential-stores/memory-store';
import { CredentialStuffer } from '../../credential-stuffer/CredentialStuffer';
import { CredentialStoreType } from '../../types';
import { getTemplateEnvironmentVariables } from '../../utils/env-detection';

describe('Environment credential access', () => {
  beforeEach(() => {
    vi.stubEnv('INKEEP_CLOUD_DEPLOYMENT', undefined);
    vi.stubEnv('INKEEP_ENABLE_ENVIRONMENT_CREDENTIALS', undefined);
    vi.stubEnv('PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT', 'false');
    vi.stubEnv('NEXT_PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT', 'false');
    vi.stubEnv('ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET', 'synthetic-platform-secret');
    vi.stubEnv('NANGO_SECRET_KEY', undefined);
    vi.stubEnv('COMPOSIO_API_KEY', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not resolve server environment credentials when disabled by default', async () => {
    const stores = [new InMemoryCredentialStore(), new InMemoryCredentialStore('custom-memory')];

    for (const store of stores) {
      expect(await store.get('ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET')).toBeNull();
      expect(await store.checkAvailability()).toMatchObject({ available: false });
    }
  });

  it('does not resolve server environment credentials when explicitly disabled', async () => {
    vi.stubEnv('INKEEP_ENABLE_ENVIRONMENT_CREDENTIALS', 'false');

    const store = new InMemoryCredentialStore('custom-memory');

    expect(await store.get('ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET')).toBeNull();
  });

  it('does not use deployment or public UI flags to control environment credential access', async () => {
    vi.stubEnv('INKEEP_CLOUD_DEPLOYMENT', 'true');
    vi.stubEnv('PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT', 'true');
    vi.stubEnv('NEXT_PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT', 'true');

    const store = new InMemoryCredentialStore();

    expect(await store.get('ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET')).toBeNull();

    vi.stubEnv('INKEEP_ENABLE_ENVIRONMENT_CREDENTIALS', 'true');

    expect(await store.get('ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET')).toBe(
      'synthetic-platform-secret'
    );
  });

  it('does not return previously cached environment credentials after access is disabled', async () => {
    vi.stubEnv('INKEEP_ENABLE_ENVIRONMENT_CREDENTIALS', 'true');

    const store = new InMemoryCredentialStore();

    expect(await store.get('ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET')).toBe(
      'synthetic-platform-secret'
    );

    vi.stubEnv('INKEEP_ENABLE_ENVIRONMENT_CREDENTIALS', 'false');

    expect(await store.get('ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET')).toBeNull();
  });

  it('does not return explicitly stored memory credentials while access is disabled', async () => {
    const store = new InMemoryCredentialStore('custom-memory');
    await store.set('synthetic-credential', 'synthetic-runtime-credential');

    expect(await store.get('synthetic-credential')).toBeNull();
  });

  it('allows environment and runtime credentials when explicitly enabled', async () => {
    vi.stubEnv('INKEEP_ENABLE_ENVIRONMENT_CREDENTIALS', 'true');

    const store = new InMemoryCredentialStore();

    expect(await store.get('ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET')).toBe(
      'synthetic-platform-secret'
    );

    await store.set('ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET', 'synthetic-runtime-credential');

    expect(await store.get('ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET')).toBe(
      'synthetic-runtime-credential'
    );
    expect(await store.checkAvailability()).toEqual({ available: true });
  });

  it('excludes memory credentials from the default registry unless explicitly enabled', () => {
    const disabledStores = createDefaultCredentialStores();

    expect(disabledStores.some((store) => store.type === CredentialStoreType.memory)).toBe(false);

    vi.stubEnv('INKEEP_ENABLE_ENVIRONMENT_CREDENTIALS', 'true');

    const enabledStores = createDefaultCredentialStores();

    expect(enabledStores.some((store) => store.type === CredentialStoreType.memory)).toBe(true);
  });

  it('does not expose an environment credential through a saved reference without opt-in', async () => {
    const registry = new CredentialStoreRegistry([new InMemoryCredentialStore('custom-memory')]);
    const stuffer = new CredentialStuffer(registry);
    const headers = await stuffer.getCredentialHeaders({
      context: { tenantId: 'synthetic-tenant', projectId: 'synthetic-project' },
      storeReference: {
        credentialStoreId: 'custom-memory',
        retrievalParams: { key: 'ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET' },
      },
    });

    expect(headers).toEqual({});
  });

  it('keeps explicitly enabled store references working', async () => {
    vi.stubEnv('INKEEP_ENABLE_ENVIRONMENT_CREDENTIALS', 'true');

    const registry = new CredentialStoreRegistry([new InMemoryCredentialStore('custom-memory')]);
    const stuffer = new CredentialStuffer(registry);
    const headers = await stuffer.getCredentialHeaders({
      context: { tenantId: 'synthetic-tenant', projectId: 'synthetic-project' },
      storeReference: {
        credentialStoreId: 'custom-memory',
        retrievalParams: { key: 'ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET' },
      },
    });

    expect(headers).toEqual({ Authorization: 'Bearer synthetic-platform-secret' });
  });

  it.each([
    { accessFlag: undefined, expectedAuthorization: '' },
    { accessFlag: 'false', expectedAuthorization: '' },
    { accessFlag: 'true', expectedAuthorization: 'synthetic-platform-secret' },
  ])('resolves environment header templates according to access flag $accessFlag', async ({
    accessFlag,
    expectedAuthorization,
  }) => {
    vi.stubEnv('INKEEP_ENABLE_ENVIRONMENT_CREDENTIALS', accessFlag);

    const stuffer = new CredentialStuffer(new CredentialStoreRegistry(), {
      resolveHeaders: async () => ({ tenant: 'synthetic-tenant' }),
    });
    const headers = await stuffer.getCredentialHeaders({
      context: {
        tenantId: 'synthetic-tenant',
        projectId: 'synthetic-project',
        conversationId: 'synthetic-conversation',
        contextConfigId: 'synthetic-context',
      },
      headers: {
        Authorization: '{{$env.ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET}}',
        'X-Tenant': '{{headers.tenant}}',
      },
    });

    expect(headers).toEqual({
      Authorization: expectedAuthorization,
      'X-Tenant': 'synthetic-tenant',
    });
  });

  it('keeps ordinary prompt context and runtime builtins without environment credential access', () => {
    const result = TemplateEngine.renderPrompt(
      '{{name}} {{$runtime.requestId}} {{$env.ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET}}',
      { name: 'Synthetic agent' },
      { runtimeBuiltins: { $runtime: { requestId: 'synthetic-request' } } }
    );

    expect(result).toBe('Synthetic agent synthetic-request ');
  });

  it.each([
    { accessFlag: undefined, expectedCredential: '' },
    { accessFlag: 'false', expectedCredential: '' },
    { accessFlag: 'true', expectedCredential: 'synthetic-platform-secret' },
  ])('resolves quoted environment context paths according to access flag $accessFlag', ({
    accessFlag,
    expectedCredential,
  }) => {
    vi.stubEnv('INKEEP_ENABLE_ENVIRONMENT_CREDENTIALS', accessFlag);

    const context = { $env: getTemplateEnvironmentVariables() };
    const result = TemplateEngine.render(
      '{{"$env".ENVIRONMENT_CREDENTIAL_ACCESS_TEST_SECRET}}',
      context
    );

    expect(result).toBe(expectedCredential);
  });
});
