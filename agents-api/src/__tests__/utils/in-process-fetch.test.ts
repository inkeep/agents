import { describe, expect, it } from 'vitest';

describe('in-process-fetch re-export', () => {
  it('should re-export registerAppFetch and getInProcessFetch from @inkeep/agents-core', async () => {
    const apiModule = await import('../../utils/in-process-fetch');

    expect(apiModule.registerAppFetch).toBeDefined();
    expect(typeof apiModule.registerAppFetch).toBe('function');
    expect(apiModule.getInProcessFetch).toBeDefined();
    expect(typeof apiModule.getInProcessFetch).toBe('function');
  });
});
