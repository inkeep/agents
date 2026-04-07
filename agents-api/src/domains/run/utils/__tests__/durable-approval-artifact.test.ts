import { describe, expect, it, vi } from 'vitest';
import {
  buildDurableApprovalArtifact,
  DurableApprovalDataSchema,
  extractDurableApprovalArtifact,
} from '../durable-approval-artifact';

describe('DurableApprovalDataSchema', () => {
  it('should validate a correct approval data object', () => {
    const result = DurableApprovalDataSchema.safeParse({
      type: 'durable-approval-required',
      toolCallId: 'tc-123',
      toolName: 'dangerous_tool',
      args: { foo: 'bar' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject wrong type literal', () => {
    const result = DurableApprovalDataSchema.safeParse({
      type: 'something-else',
      toolCallId: 'tc-123',
      toolName: 'dangerous_tool',
      args: {},
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty toolCallId', () => {
    const result = DurableApprovalDataSchema.safeParse({
      type: 'durable-approval-required',
      toolCallId: '',
      toolName: 'dangerous_tool',
      args: {},
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing toolName', () => {
    const result = DurableApprovalDataSchema.safeParse({
      type: 'durable-approval-required',
      toolCallId: 'tc-123',
      args: {},
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional delegatedApproval', () => {
    const result = DurableApprovalDataSchema.safeParse({
      type: 'durable-approval-required',
      toolCallId: 'tc-123',
      toolName: 'dangerous_tool',
      args: {},
      delegatedApproval: {
        toolCallId: 'tc-456',
        toolName: 'sub_tool',
        args: { x: 1 },
        subAgentId: 'agent-a',
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('extractDurableApprovalArtifact', () => {
  const validApprovalData = {
    type: 'durable-approval-required',
    toolCallId: 'tc-123',
    toolName: 'dangerous_tool',
    args: { query: 'test' },
  };

  it('should extract approval from direct parts', () => {
    const taskResult = {
      parts: [{ kind: 'data', data: validApprovalData }],
    };
    const result = extractDurableApprovalArtifact(taskResult);
    expect(result).toEqual(validApprovalData);
  });

  it('should extract approval from artifacts → parts', () => {
    const taskResult = {
      artifacts: [
        {
          parts: [{ kind: 'data', data: validApprovalData }],
        },
      ],
    };
    const result = extractDurableApprovalArtifact(taskResult);
    expect(result).toEqual(validApprovalData);
  });

  it('should prefer direct parts over artifacts', () => {
    const directData = { ...validApprovalData, toolCallId: 'direct-tc' };
    const artifactData = { ...validApprovalData, toolCallId: 'artifact-tc' };
    const taskResult = {
      parts: [{ kind: 'data', data: directData }],
      artifacts: [{ parts: [{ kind: 'data', data: artifactData }] }],
    };
    const result = extractDurableApprovalArtifact(taskResult);
    expect(result?.toolCallId).toBe('direct-tc');
  });

  it('should return undefined for null/undefined input', () => {
    expect(extractDurableApprovalArtifact(null)).toBeUndefined();
    expect(extractDurableApprovalArtifact(undefined)).toBeUndefined();
  });

  it('should return undefined for empty object', () => {
    expect(extractDurableApprovalArtifact({})).toBeUndefined();
  });

  it('should return undefined when no approval artifact exists', () => {
    const taskResult = {
      artifacts: [
        {
          parts: [{ kind: 'data', data: { type: 'transfer', target: 'agent-b' } }],
        },
      ],
    };
    expect(extractDurableApprovalArtifact(taskResult)).toBeUndefined();
  });

  it('should return undefined and log error for malformed approval data', () => {
    const mockLogger = { error: vi.fn() };
    const taskResult = {
      parts: [
        {
          kind: 'data',
          data: {
            type: 'durable-approval-required',
            toolCallId: '',
            toolName: 'dangerous_tool',
            args: {},
          },
        },
      ],
    };
    const result = extractDurableApprovalArtifact(taskResult, { caller: 'test' }, mockLogger);
    expect(result).toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalledOnce();
    expect(mockLogger.error.mock.calls[0][1]).toContain('failed schema validation');
  });

  it('should skip non-data parts', () => {
    const taskResult = {
      parts: [
        { kind: 'text', text: 'hello' },
        { kind: 'data', data: validApprovalData },
      ],
    };
    const result = extractDurableApprovalArtifact(taskResult);
    expect(result).toEqual(validApprovalData);
  });

  it('should handle deeply nested artifacts with multiple parts', () => {
    const taskResult = {
      artifacts: [
        { parts: [{ kind: 'text', text: 'irrelevant' }] },
        {
          parts: [
            { kind: 'data', data: { type: 'other' } },
            { kind: 'data', data: validApprovalData },
          ],
        },
      ],
    };
    const result = extractDurableApprovalArtifact(taskResult);
    expect(result).toEqual(validApprovalData);
  });

  it('should return undefined for non-object input', () => {
    expect(extractDurableApprovalArtifact('string')).toBeUndefined();
    expect(extractDurableApprovalArtifact(42)).toBeUndefined();
    expect(extractDurableApprovalArtifact(true)).toBeUndefined();
  });
});

describe('buildDurableApprovalArtifact', () => {
  it('should build a valid artifact array', () => {
    const artifacts = buildDurableApprovalArtifact(
      { toolCallId: 'tc-1', toolName: 'my_tool', args: { x: 1 } },
      'art-123'
    );

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].artifactId).toBe('art-123');
    expect(artifacts[0].parts).toHaveLength(1);
    expect(artifacts[0].parts[0]).toEqual({
      kind: 'data',
      data: {
        type: 'durable-approval-required',
        toolCallId: 'tc-1',
        toolName: 'my_tool',
        args: { x: 1 },
      },
    });
    expect(artifacts[0].createdAt).toBeDefined();
  });

  it('should produce artifacts that roundtrip through extraction', () => {
    const artifacts = buildDurableApprovalArtifact(
      { toolCallId: 'tc-rt', toolName: 'roundtrip_tool', args: null },
      'art-rt'
    );

    const extracted = extractDurableApprovalArtifact({ artifacts });
    expect(extracted).toBeDefined();
    expect(extracted?.toolCallId).toBe('tc-rt');
    expect(extracted?.toolName).toBe('roundtrip_tool');
    expect(extracted?.args).toBeNull();
  });
});
