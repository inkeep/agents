import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentsRunDatabaseClient } from '@inkeep/agents-core';
import { type ParsedHttpRequest, validateHeaders } from '../../context/validation';

// Mock the data access functions from @inkeep/agents-core
const mockGetAgentWithDefaultSubAgent = vi.fn();
const mockGetContextConfigById = vi.fn();

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as any),
    getAgentWithDefaultSubAgent: () => mockGetAgentWithDefaultSubAgent,
    getContextConfigById: () => mockGetContextConfigById,
  };
});

describe('validateHeaders - Integration with Flattened Headers', () => {
  let dbClient: AgentsRunDatabaseClient;

  beforeEach(async () => {
    dbClient = {} as AgentsRunDatabaseClient;
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

    mockGetAgentWithDefaultSubAgent.mockResolvedValue({
      id: 'test-agent',
      contextConfigId: 'test-config',
    });

    mockGetContextConfigById.mockResolvedValue({
      id: 'test-config',
      headersSchema: headersSchema,
    });

    const parsedRequest: ParsedHttpRequest = {
      headers: {
        'x-api-key': 'abc123',
        'user-id': '456',
        'extra-header': 'should-be-filtered-out',
      },
    };

    const result = await validateHeaders({
      tenantId: 'tenant1',
      projectId: 'project1',
      agentId: 'agent1',
      conversationId: 'conv1',
      parsedRequest,
      dbClient,
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

    mockGetAgentWithDefaultSubAgent.mockResolvedValue({
      contextConfigId: 'test-config',
    });

    mockGetContextConfigById.mockResolvedValue({
      id: 'test-config',
      headersSchema: headersSchema,
    });

    const parsedRequest: ParsedHttpRequest = {
      headers: {
        'other-header': 'value',
      },
    };

    const result = await validateHeaders({
      tenantId: 'tenant1',
      projectId: 'project1',
      agentId: 'agent1',
      conversationId: 'conv1',
      parsedRequest,
      dbClient,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.field.includes('headers'))).toBe(true);
  });

  it('should work without context config (no validation)', async () => {
    mockGetAgentWithDefaultSubAgent.mockResolvedValue({
      id: 'test-agent',
    });

    const parsedRequest: ParsedHttpRequest = {
      headers: { 'any-header': 'any-value' },
    };

    const result = await validateHeaders({
      tenantId: 'tenant1',
      projectId: 'project1',
      agentId: 'agent1',
      conversationId: 'conv1',
      parsedRequest,
      dbClient,
    });

    expect(result.valid).toBe(true);
    expect(result.validatedContext).toEqual(parsedRequest);
  });
});
