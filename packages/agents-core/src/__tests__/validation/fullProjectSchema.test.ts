import { describe, expect, it } from 'vitest';
import { FullProjectDefinitionSchema } from '../../validation/schemas';

describe('FullProjectDefinitionSchema', () => {
  const validFullProject = {
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project for validation',
    models: {
      base: {
        model: 'gpt-4o-mini',
        providerOptions: { openai: { temperature: 0.7 } },
      },
      structuredOutput: {
        model: 'gpt-4o',
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
        defaultAgentId: 'agent-1',
        agents: {
          'agent-1': {
            id: 'agent-1',
            name: 'Test Agent',
            prompt: 'You are a test agent',
            tools: [],
            type: 'internal',
          },
        },
        tools: {},
      },
    },
    credentialReferences: [
      {
        id: 'cred-1',
        type: 'bearer' as const,
        credentialStoreId: 'store-1',
        retrievalParams: {},
      },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('should validate a complete full project definition', () => {
    const result = FullProjectDefinitionSchema.safeParse(validFullProject);
    expect(result.success).toBe(true);
  });

  it('should validate a minimal project definition', () => {
    const minimalProject = {
      id: 'minimal-project',
      name: 'Minimal Project',
      description: '',
      graphs: {},
    };

    const result = FullProjectDefinitionSchema.safeParse(minimalProject);
    expect(result.success).toBe(true);
  });

  it('should require id and name fields', () => {
    const invalidProject = {
      description: 'Missing required fields',
      graphs: {},
    };

    const result = FullProjectDefinitionSchema.safeParse(invalidProject);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: ['id'] }),
          expect.objectContaining({ path: ['name'] }),
        ])
      );
    }
  });

  it('should validate models structure', () => {
    const projectWithInvalidModels = {
      ...validFullProject,
      models: {
        base: {
          model: 123, // Should be string
        },
      },
    };

    const result = FullProjectDefinitionSchema.safeParse(projectWithInvalidModels);
    expect(result.success).toBe(false);
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
          agents: 'not-an-object', // Should be object
          tools: {},
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
      graphs: {},
      // credentialReferences omitted
      // models omitted
      // stopWhen omitted
      // createdAt omitted
      // updatedAt omitted
    };

    const result = FullProjectDefinitionSchema.safeParse(projectWithOptionalFields);
    expect(result.success).toBe(true);
  });

  it('should validate credential references array', () => {
    const projectWithInvalidCredentials = {
      ...validFullProject,
      credentialReferences: [
        {
          id: 'cred-1',
          type: 'invalid-type', // Should be valid credential type
          credentialStoreId: 'store-1',
        },
      ],
    };

    const result = FullProjectDefinitionSchema.safeParse(projectWithInvalidCredentials);
    expect(result.success).toBe(false);
  });
});
