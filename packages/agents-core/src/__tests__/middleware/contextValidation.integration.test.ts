import { describe, expect, it, vi, beforeEach } from 'vitest';
import { validateRequestContext, type ParsedHttpRequest } from '../../middleware/contextValidation';
import { dbClient } from '../setup';

// Mock the data access functions
const mockGetAgentGraphWithDefaultAgent = vi.fn();
const mockGetContextConfigById = vi.fn();

vi.mock('../../data-access/agentGraphs', () => ({
  getAgentGraphWithDefaultAgent: () => mockGetAgentGraphWithDefaultAgent,
}));

vi.mock('../../data-access/contextConfigs', () => ({
  getContextConfigById: () => mockGetContextConfigById,
}));

describe('validateRequestContext - Integration with Flattened Headers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return flattened headers as validatedContext', async () => {
    // Simple headers schema
    const headersSchema = {
      type: 'object',
      properties: {
        'x-api-key': { type: 'string' },
        'user-id': { type: 'string' },
      },
    };

    // Mock successful database calls
    mockGetAgentGraphWithDefaultAgent.mockResolvedValue({
      id: 'test-graph',
      contextConfigId: 'test-config',
    });

    mockGetContextConfigById.mockResolvedValue({
      id: 'test-config',
      requestContextSchema: headersSchema,
    });

    // Test request with headers
    const parsedRequest: ParsedHttpRequest = {
      headers: {
        'x-api-key': 'abc123',
        'user-id': '456',
        'extra-header': 'should-be-filtered-out', // This should be filtered by schema
      },
    };

    const result = await validateRequestContext({
      tenantId: 'tenant1',
      projectId: 'project1',
      graphId: 'graph1',
      conversationId: 'conv1',
      parsedRequest,
      dbClient,
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);

    // The validatedContext should be the headers directly (flattened),
    // and filtered to only include schema-defined properties
    expect(result.validatedContext).toEqual({
      'x-api-key': 'abc123',
      'user-id': '456',
      // 'extra-header' should be filtered out since it's not in schema
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

    mockGetAgentGraphWithDefaultAgent.mockResolvedValue({
      contextConfigId: 'test-config',
    });

    mockGetContextConfigById.mockResolvedValue({
      id: 'test-config',
      requestContextSchema: headersSchema,
    });

    const parsedRequest: ParsedHttpRequest = {
      headers: {
        'other-header': 'value',
        // Missing required 'x-api-key'
      },
    };

    const result = await validateRequestContext({
      tenantId: 'tenant1',
      projectId: 'project1',
      graphId: 'graph1',
      conversationId: 'conv1',
      parsedRequest,
      dbClient,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.field.includes('headers'))).toBe(true);
  });

  it('should work without context config (no validation)', async () => {
    // No context config
    mockGetAgentGraphWithDefaultAgent.mockResolvedValue({
      id: 'test-graph',
      // No contextConfigId
    });

    const parsedRequest: ParsedHttpRequest = {
      headers: { 'any-header': 'any-value' },
    };

    const result = await validateRequestContext({
      tenantId: 'tenant1',
      projectId: 'project1',
      graphId: 'graph1',
      conversationId: 'conv1',
      parsedRequest,
      dbClient,
    });

    expect(result.valid).toBe(true);
    expect(result.validatedContext).toEqual(parsedRequest);
  });
});
