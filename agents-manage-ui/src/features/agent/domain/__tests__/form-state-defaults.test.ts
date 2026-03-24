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
        subAgentId: 'sub-agent-1',
      })
    ).toEqual({
      toolId: 'weather',
      relationshipId: undefined,
      subAgentId: 'sub-agent-1',
      selectedTools: null,
      headers: '{}',
      toolPolicies: {},
    });

    expect(getMcpRelationFormKey({ nodeId: 'tmp-node', relationshipId: null })).toBe('tmp-node');
    expect(getMcpRelationFormKey({ nodeId: 'tmp-node', relationshipId: 'rel-1' })).toBe('rel-1');
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
