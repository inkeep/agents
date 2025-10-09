import { describe, expect, it } from 'vitest';
import { FullProjectDefinitionSchema } from '../../validation/schemas';

describe('FullProjectDefinitionSchema', () => {
  const validFullProject = {
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project for validation',
    models: {
      base: {
        model: 'claude-sonnet-4',
        providerOptions: {},
      },
    },
    stopWhen: {
      transferCountIs: 10,
      stepCountIs: 50,
    },
    graphs: {
      'graph-1': {
        id: 'graph-1',
        name: 'Test Graph',
        description: 'A test graph',
        defaultSubAgentId: 'agent-1',
        subAgents: {
          'agent-1': {
            id: 'agent-1',
            name: 'Test Agent',
            description: 'A test agent for validation',
            prompt: 'You are a test agent',
            canUse: [],
            type: 'internal',
          },
        },
      },
    },
    tools: {},
    credentialReferences: {
      'cred-1': {
        id: 'cred-1',
        type: 'memory' as const,
        credentialStoreId: 'store-1',
        retrievalParams: {},
      },
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should validate a complete full project definition', () => {
    const result = FullProjectDefinitionSchema.safeParse(validFullProject);
    if (!result.success) {
      console.error('Validation failed:', JSON.stringify(result.error.format(), null, 2));
      console.error('Raw issues:', result.error.issues);
    }
    expect(result.success).toBe(true);
  });

  it('should validate a minimal project definition', () => {
    const minimalProject = {
      id: 'minimal-project',
      name: 'Minimal Project',
      description: '',
      models: {
        base: {
          model: 'claude-sonnet-4',
          providerOptions: {},
        },
      },
      graphs: {},
      tools: {},
    };

    const result = FullProjectDefinitionSchema.safeParse(minimalProject);
    expect(result.success).toBe(true);
  });

  it('should require id, name, models, graphs, and tools fields', () => {
    const invalidProject = {
      description: 'Missing required fields',
    };

    const result = FullProjectDefinitionSchema.safeParse(invalidProject);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['id'] }),
          expect.objectContaining({ path: ['name'] }),
          expect.objectContaining({ path: ['models'] }),
          expect.objectContaining({ path: ['graphs'] }),
          expect.objectContaining({ path: ['tools'] }),
        ])
      );
    }
  });

  it('should validate stopWhen constraints', () => {
    const projectWithInvalidStopWhen = {
      ...validFullProject,
      stopWhen: {
        transferCountIs: -1, // Should be minimum 1
        stepCountIs: 2000, // Should be maximum 1000
      },
    };

    const result = FullProjectDefinitionSchema.safeParse(projectWithInvalidStopWhen);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['stopWhen', 'transferCountIs'] }),
          expect.objectContaining({ path: ['stopWhen', 'stepCountIs'] }),
        ])
      );
    }
  });

  it('should validate nested graph structure', () => {
    const projectWithInvalidGraph = {
      ...validFullProject,
      graphs: {
        'invalid-graph': {
          id: 'invalid-graph',
          name: 'Invalid Graph',
          // Missing description
          subAgents: 'not-an-object', // Should be object
        },
      },
    };

    const result = FullProjectDefinitionSchema.safeParse(projectWithInvalidGraph);
    expect(result.success).toBe(false);
  });

  it('should allow optional fields to be undefined', () => {
    const projectWithOptionalFields = {
      id: 'test-project',
      name: 'Test Project',
      description: 'A test project',
      models: {
        base: {
          model: 'claude-sonnet-4',
          providerOptions: {},
        },
      },
      graphs: {},
      tools: {},
      // credentialReferences omitted
      // stopWhen omitted
      // createdAt omitted
      // updatedAt omitted
    };

    const result = FullProjectDefinitionSchema.safeParse(projectWithOptionalFields);
    expect(result.success).toBe(true);
  });

  it('should validate credential references record', () => {
    const projectWithInvalidCredentials = {
      ...validFullProject,
      credentialReferences: {
        'cred-1': {
          id: 'cred-1',
          type: 'invalid-type' as any, // Should be one of: memory, keychain, nango
          credentialStoreId: 'store-1',
          retrievalParams: {},
        },
      },
    };

    const result = FullProjectDefinitionSchema.safeParse(projectWithInvalidCredentials);
    expect(result.success).toBe(false);
  });
});
