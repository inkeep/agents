import { describe, expect, it } from 'vitest';
import { findFunctionToolIdsForFunctionId, getFunctionIdForTool } from '../function-tool-identity';

describe('function-tool-identity', () => {
  it('resolves the function id for a function tool when toolId and functionId differ', () => {
    expect(
      getFunctionIdForTool('function-tool-1', {
        'function-tool-1': {
          functionId: 'function-1',
          name: 'Lookup customer',
          description: '',
          tempToolPolicies: {},
        },
      } as any)
    ).toBe('function-1');
  });

  it('finds every function tool that references the same function id', () => {
    expect(
      findFunctionToolIdsForFunctionId('function-1', {
        'function-tool-1': {
          functionId: 'function-1',
          name: 'Lookup customer',
          description: '',
          tempToolPolicies: {},
        },
        'function-tool-2': {
          functionId: 'function-1',
          name: 'Lookup account',
          description: '',
          tempToolPolicies: {},
        },
      } as any)
    ).toEqual(['function-tool-1', 'function-tool-2']);
  });
});
