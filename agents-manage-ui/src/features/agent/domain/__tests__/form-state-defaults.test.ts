import { describe, expect, it } from 'vitest';
import {
  createFunctionToolFormInput,
  createMcpRelationFormInput,
  createSubAgentFormInput,
  getMcpRelationFormKey,
} from '@/features/agent/domain/form-state-defaults';

describe('form state defaults', () => {
  it('creates complete sub-agent form input defaults', () => {
    expect(
      createSubAgentFormInput({
        id: 'sub-agent-1',
        name: 'Sub agent 1',
      })
    ).toEqual({
      id: 'sub-agent-1',
      name: 'Sub agent 1',
      description: '',
      prompt: '',
      type: 'internal',
      models: {
        base: {},
        summarizer: {},
        structuredOutput: {},
      },
      canUse: [],
      dataComponents: [],
      artifactComponents: [],
      stopWhen: {},
      skills: [],
    });
  });

  it('creates explicit MCP relation defaults and stable relation keys', () => {
    expect(
      createMcpRelationFormInput({
        toolId: 'weather',
      })
    ).toEqual({
      toolId: 'weather',
      relationshipId: undefined,
      selectedTools: null,
      headers: '{}',
      toolPolicies: {},
    });

    expect(getMcpRelationFormKey({ nodeId: 'tmp-node' })).toBe('tmp-node');
  });

  it('creates explicit function tool defaults', () => {
    expect(
      createFunctionToolFormInput({
        functionId: 'function-tool-1',
      })
    ).toEqual({
      functionId: 'function-tool-1',
      name: 'Function Tool',
      description: '',
      tempToolPolicies: {},
    });
  });
});
