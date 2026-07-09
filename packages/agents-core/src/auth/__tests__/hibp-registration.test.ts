import { describe, expect, it } from 'vitest';
import { testRunDbClient } from '../../__tests__/setup';
import { createAuth } from '../auth';

describe('createAuth haveIBeenPwned plugin registration', () => {
  it('registers the have-i-been-pwned plugin by default', () => {
    const auth = createAuth({
      baseURL: 'http://localhost:3002',
      secret: 'test-secret-test-secret-test-secret',
      dbClient: testRunDbClient,
    });

    const plugins = (auth as unknown as { options: { plugins: Array<{ id: string }> } }).options
      .plugins;
    const hibpPlugin = plugins.find((p) => p.id === 'have-i-been-pwned');
    expect(hibpPlugin).toBeDefined();
  });

  it('does not register the plugin when disablePasswordCompromiseCheck is set', () => {
    const auth = createAuth({
      baseURL: 'http://localhost:3002',
      secret: 'test-secret-test-secret-test-secret',
      dbClient: testRunDbClient,
      disablePasswordCompromiseCheck: true,
    });

    const plugins = (auth as unknown as { options: { plugins: Array<{ id: string }> } }).options
      .plugins;
    const hibpPlugin = plugins.find((p) => p.id === 'have-i-been-pwned');
    expect(hibpPlugin).toBeUndefined();
  });
});
