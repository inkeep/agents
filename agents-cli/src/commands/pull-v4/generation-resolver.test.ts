import type { FullProjectDefinition } from '@inkeep/agents-core';
import { describe, expect, it } from 'vitest';
import { ComponentRegistry } from './component-registry';
import { createFileScope } from './file-scope';
import { GenerationResolver } from './generation-resolver';

function createProjectFixture(): FullProjectDefinition {
  return {
    id: 'support-project',
    name: 'Support Project',
    agents: {
      'support-agent': {
        id: 'support-agent',
        name: 'Support Agent',
        defaultSubAgentId: 'tier-one',
        subAgents: {
          'tier-one': {
            id: 'tier-one',
            name: 'Tier One',
            canUse: [],
          },
        },
      },
    },
    tools: {
      'tool-1': {
        id: 'tool-1',
        name: 'Search',
      },
    },
    functions: {
      'function-1': {
        id: 'function-1',
        name: 'Shared Lookup',
      },
    },
    functionTools: {
      'function-tool-1': {
        id: 'function-tool-1',
        functionId: 'function-1',
        name: 'Shared Lookup',
      },
    },
    credentialReferences: {
      'cred-a': {
        id: 'cred-a',
        name: 'Shared',
        type: 'memory',
        credentialStoreId: 'main-store',
      },
      'cred-b': {
        id: 'cred-b',
        name: 'Shared',
        type: 'memory',
        credentialStoreId: 'main-store',
      },
    },
    externalAgents: {
      ext1234567890abcd: {
        id: 'ext1234567890abcd',
        name: 'Escalation Agent',
        url: 'https://example.com/agent',
      },
    },
  } as FullProjectDefinition;
}

describe('GenerationResolver', () => {
  it('prefers existing export names and file paths from the component registry', () => {
    const registry = new ComponentRegistry();
    registry.register('tool-1', 'tools', 'tools/custom-search.ts', 'customSearchTool');
    registry.register('cred-a', 'credentials', 'credentials/auth.ts', 'authCredential');
    registry.register('tier-one', 'subAgents', 'agents/support-agent.ts', 'tierOneLocal', true);
    registry.register('support-agent', 'agents', 'agents/support-agent.ts', 'supportAgentLocal');
    registry.register(
      'ext1234567890abcd',
      'externalAgents',
      'external-agents/escalation.ts',
      'escalationAgent'
    );

    const resolver = new GenerationResolver({
      project: createProjectFixture(),
      projectRoot: '/tmp/project',
      completeAgentIds: new Set(['support-agent']),
      existingComponentRegistry: registry,
    });

    expect(resolver.getToolReferenceName('tool-1')).toBe('customSearchTool');
    expect(resolver.getToolReferencePath('tool-1')).toBe('custom-search');
    expect(resolver.getCredentialReferenceName('cred-a')).toBe('authCredential');
    expect(resolver.getCredentialReferencePath('cred-a')).toBe('auth');
    expect(resolver.getSubAgentReferenceName('tier-one')).toBe('tierOneLocal');
    expect(resolver.getSubAgentReferencePath('tier-one')).toBe('support-agent');
    expect(resolver.getAgentReferenceName('support-agent')).toBe('supportAgentLocal');
    expect(resolver.getExternalAgentReferenceName('ext1234567890abcd')).toBe('escalationAgent');
    expect(resolver.resolveOutputFilePath('tools', 'tool-1', '/tmp/project/tools/search.ts')).toBe(
      '/tmp/project/tools/custom-search.ts'
    );
  });

  it('falls back to generated names and deduplicated paths when no registry entry exists', () => {
    const resolver = new GenerationResolver({
      project: createProjectFixture(),
      projectRoot: '/tmp/project',
      completeAgentIds: new Set(['support-agent']),
    });

    expect(resolver.getCredentialReferenceName('cred-a')).toBe('sharedCredential');
    expect(resolver.getCredentialReferenceName('cred-b')).toBe('sharedCredential1');
    expect(resolver.getToolReferenceName('function-tool-1')).toBe('sharedLookupTool');
    expect(resolver.getToolReferencePath('function-tool-1')).toBe('shared-lookup');
    expect(resolver.getSubAgentReferenceName('tier-one')).toBe('tierOne');
    expect(resolver.getSubAgentReferencePath('tier-one')).toBe('tier-one');
    expect(resolver.getAgentReferencePath('support-agent')).toBe('support-agent');
    expect(resolver.getExternalAgentReferenceName('ext1234567890abcd')).toBe('escalationAgent');
    expect(resolver.getExternalAgentReferencePath('ext1234567890abcd')).toBe('escalation-agent');
  });
});

describe('createFileScope', () => {
  it('collects reserved top-level names from imports and declarations', () => {
    const { reservedNames } = createFileScope(`
      import defaultThing, { namedThing as localThing } from 'pkg';
      import * as namespaceThing from 'pkg2';

      export const thing = 1;
      function helper() {}
      class Widget {}
      interface Shape {}
      type Alias = string;
      enum State {
        Ready,
      }
      namespace Internal {
        export const nested = true;
      }
    `);

    expect(reservedNames).toEqual(
      new Set([
        'defaultThing',
        'localThing',
        'namespaceThing',
        'thing',
        'helper',
        'Widget',
        'Shape',
        'Alias',
        'State',
        'Internal',
      ])
    );
  });
});
