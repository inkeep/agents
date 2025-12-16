import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type ParsedHttpRequest, validateHeaders } from '../../context/validation';

function createMockExecutionContext(params: {
  tenantId: string;
  projectId: string;
  agentId: string;
  headersSchema?: Record<string, unknown> | null;
  includeContextConfig?: boolean;
}) {
  const { tenantId, projectId, agentId, headersSchema, includeContextConfig = true } = params;

  return {
    apiKey: 'test-api-key',
    apiKeyId: 'test-api-key-id',
    tenantId,
    projectId,
    agentId,
    baseUrl: 'http://localhost:3000',
    resolvedRef: { type: 'branch', name: 'main', hash: 'test-hash' },
    project: {
      id: projectId,
      tenantId,
      name: 'Test Project',
      agents: {
        [agentId]: {
          id: agentId,
          tenantId,
          projectId,
          name: 'Test Agent',
          description: 'Test agent',
          defaultSubAgentId: agentId,
          subAgents: {},
          tools: {},
          externalAgents: {},
          teamAgents: {},
          transferRelations: {},
          delegateRelations: {},
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          ...(includeContextConfig
            ? {
                contextConfigId: 'test-config',
                contextConfig: {
                  id: 'test-config',
                  headersSchema: headersSchema ?? null,
                },
              }
            : {}),
        },
      },
      tools: {},
      functions: {},
      dataComponents: {},
      artifactComponents: {},
      externalAgents: {},
      credentialReferences: {},
      statusUpdates: null,
    },
  } as any;
}

describe('validateHeaders - Integration with Flattened Headers', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('should return flattened headers as validatedContext', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        'x-api-key': { type: 'string' },
        'user-id': { type: 'string' },
      },
    };

    const executionContext = createMockExecutionContext({
      tenantId: 'tenant1',
      projectId: 'project1',
      agentId: 'agent1',
      headersSchema,
      includeContextConfig: true,
    });

    const parsedRequest: ParsedHttpRequest = {
      headers: {
        'x-api-key': 'abc123',
        'user-id': '456',
        'extra-header': 'should-be-filtered-out',
      },
    };

    const result = await validateHeaders({
      conversationId: 'conv1',
      parsedRequest,
      executionContext,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);

    expect(result.validatedContext).toEqual({
      'x-api-key': 'abc123',
      'user-id': '456',
    });
  });

  it('should handle missing required headers', async () => {
    const headersSchema = {
      type: 'object',
      properties: {
        'x-api-key': { type: 'string' },
      },
      required: ['x-api-key'],
    };

    const executionContext = createMockExecutionContext({
      tenantId: 'tenant1',
      projectId: 'project1',
      agentId: 'agent1',
      headersSchema,
      includeContextConfig: true,
    });

    const parsedRequest: ParsedHttpRequest = {
      headers: {
        'other-header': 'value',
      },
    };

    const result = await validateHeaders({
      conversationId: 'conv1',
      parsedRequest,
      executionContext,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.field.includes('headers'))).toBe(true);
  });

  it('should work without context config (no validation)', async () => {
    const executionContext = createMockExecutionContext({
      tenantId: 'tenant1',
      projectId: 'project1',
      agentId: 'agent1',
      includeContextConfig: false,
    });

    const parsedRequest: ParsedHttpRequest = {
      headers: { 'any-header': 'any-value' },
    };

    const result = await validateHeaders({
      conversationId: 'conv1',
      parsedRequest,
      executionContext,
    });

    expect(result.valid).toBe(true);
    expect(result.validatedContext).toEqual(parsedRequest);
  });
});
