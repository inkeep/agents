import { describe, expect, it } from 'vitest';
import {
  AI_OPERATIONS,
  AI_TOOL_TYPES,
  NON_EVAL_USAGE_GENERATION_TYPES,
  SPAN_KEYS,
  SPAN_NAMES,
  UNKNOWN_VALUE,
} from '@/constants/signoz';
import { getSigNozStatsClient } from '../signoz-stats';

function buildResponse(rows: Array<Record<string, unknown>>) {
  return {
    data: {
      results: [
        {
          queryName: 'allSpans',
          rows: rows.map((data) => ({ data })),
        },
      ],
    },
  };
}

function makeToolCallRow(
  conversationId: string,
  toolName: string,
  opts: { description?: string; agentId?: string; tenantId?: string; timestamp?: number } = {}
): Record<string, unknown> {
  return {
    [SPAN_KEYS.CONVERSATION_ID]: conversationId,
    [SPAN_KEYS.NAME]: SPAN_NAMES.AI_TOOL_CALL,
    [SPAN_KEYS.AI_TOOL_TYPE]: AI_TOOL_TYPES.MCP,
    [SPAN_KEYS.AI_TOOL_CALL_NAME]: toolName,
    [SPAN_KEYS.MCP_TOOL_DESCRIPTION]: opts.description ?? '',
    [SPAN_KEYS.AGENT_ID]: opts.agentId ?? 'agent-1',
    [SPAN_KEYS.AGENT_NAME]: 'Test Agent',
    [SPAN_KEYS.TENANT_ID]: opts.tenantId ?? 'tenant-1',
    [SPAN_KEYS.TIMESTAMP]: opts.timestamp ?? 1700000000000,
    [SPAN_KEYS.HAS_ERROR]: false,
  };
}

function makeErrorRow(
  conversationId: string,
  spanName: string,
  opts: { timestamp?: number } = {}
): Record<string, unknown> {
  return {
    [SPAN_KEYS.CONVERSATION_ID]: conversationId,
    [SPAN_KEYS.NAME]: spanName,
    [SPAN_KEYS.HAS_ERROR]: true,
    [SPAN_KEYS.AGENT_ID]: 'agent-1',
    [SPAN_KEYS.TENANT_ID]: 'tenant-1',
    [SPAN_KEYS.TIMESTAMP]: opts.timestamp ?? 1700000000000,
  };
}

function makeMessageRow(
  conversationId: string,
  content: string,
  timestamp: number
): Record<string, unknown> {
  return {
    [SPAN_KEYS.CONVERSATION_ID]: conversationId,
    [SPAN_KEYS.NAME]: 'POST /run/api/chat',
    [SPAN_KEYS.MESSAGE_CONTENT]: content,
    [SPAN_KEYS.AGENT_ID]: 'agent-1',
    [SPAN_KEYS.TENANT_ID]: 'tenant-1',
    [SPAN_KEYS.TIMESTAMP]: timestamp,
    [SPAN_KEYS.HAS_ERROR]: false,
  };
}

function makeLlmRow(
  conversationId: string,
  opts: {
    cost?: number;
    generationType?: string;
    operationId?: string;
    timestamp?: number;
  } = {}
): Record<string, unknown> {
  return {
    [SPAN_KEYS.CONVERSATION_ID]: conversationId,
    [SPAN_KEYS.NAME]: 'ai.streamText.doStream',
    [SPAN_KEYS.AI_OPERATION_ID]: opts.operationId ?? AI_OPERATIONS.STREAM_TEXT,
    [SPAN_KEYS.AI_TELEMETRY_GENERATION_TYPE]:
      opts.generationType ?? NON_EVAL_USAGE_GENERATION_TYPES[0],
    [SPAN_KEYS.GEN_AI_COST_ESTIMATED_USD]: opts.cost ?? 0,
    [SPAN_KEYS.AGENT_ID]: 'agent-1',
    [SPAN_KEYS.AGENT_NAME]: 'Test Agent',
    [SPAN_KEYS.TENANT_ID]: 'tenant-1',
    [SPAN_KEYS.TIMESTAMP]: opts.timestamp ?? 1700000000000,
    [SPAN_KEYS.HAS_ERROR]: false,
  };
}

function parse(
  rows: Array<Record<string, unknown>>,
  conversationIds: string[],
  firstSeen?: Map<string, number>
) {
  const client = getSigNozStatsClient('test-tenant');
  return (client as any).parseDetailResponse(
    buildResponse(rows),
    conversationIds,
    firstSeen ?? new Map(conversationIds.map((id) => [id, 1700000000000]))
  );
}

describe('parseDetailResponse', () => {
  it('returns empty stats for empty input', () => {
    const { orderedStats } = parse([], []);
    expect(orderedStats).toEqual([]);
  });

  it('returns empty stats when no rows match requested conversation IDs', () => {
    const rows = [makeToolCallRow('other-conv', 'search')];
    const { orderedStats } = parse(rows, ['conv-1']);
    expect(orderedStats).toEqual([]);
  });

  it('counts MCP tool calls grouped by name', () => {
    const rows = [
      makeToolCallRow('conv-1', 'search'),
      makeToolCallRow('conv-1', 'search'),
      makeToolCallRow('conv-1', 'fetch', { description: 'Fetch a URL' }),
    ];
    const { orderedStats } = parse(rows, ['conv-1']);
    expect(orderedStats).toHaveLength(1);
    expect(orderedStats[0].totalToolCalls).toBe(3);
    expect(orderedStats[0].toolsUsed).toEqual(
      expect.arrayContaining([
        { name: 'search', calls: 2, description: '' },
        { name: 'fetch', calls: 1, description: 'Fetch a URL' },
      ])
    );
  });

  it('ignores non-MCP tool calls', () => {
    const row = {
      [SPAN_KEYS.CONVERSATION_ID]: 'conv-1',
      [SPAN_KEYS.NAME]: SPAN_NAMES.AI_TOOL_CALL,
      [SPAN_KEYS.AI_TOOL_TYPE]: AI_TOOL_TYPES.TRANSFER,
      [SPAN_KEYS.AI_TOOL_CALL_NAME]: 'transfer_to_agent',
      [SPAN_KEYS.AGENT_ID]: 'agent-1',
      [SPAN_KEYS.TENANT_ID]: 'tenant-1',
      [SPAN_KEYS.TIMESTAMP]: 1700000000000,
      [SPAN_KEYS.HAS_ERROR]: false,
    };
    const { orderedStats } = parse([row], ['conv-1']);
    expect(orderedStats[0].totalToolCalls).toBe(0);
  });

  it('counts errors only for critical span names', () => {
    const rows = [
      makeErrorRow('conv-1', 'agent.generate'),
      makeErrorRow('conv-1', 'execution_handler.execute'),
      makeErrorRow('conv-1', 'some.random.span'),
    ];
    const { orderedStats } = parse(rows, ['conv-1']);
    expect(orderedStats[0].totalErrors).toBe(2);
    expect(orderedStats[0].hasErrors).toBe(true);
  });

  it('reports hasErrors false when no critical errors', () => {
    const rows = [makeLlmRow('conv-1')];
    const { orderedStats } = parse(rows, ['conv-1']);
    expect(orderedStats[0].hasErrors).toBe(false);
    expect(orderedStats[0].totalErrors).toBe(0);
  });

  it('selects the earliest user message per conversation', () => {
    const rows = [
      makeMessageRow('conv-1', 'First message', 1700000001000),
      makeMessageRow('conv-1', 'Second message', 1700000002000),
    ];
    const { orderedStats } = parse(rows, ['conv-1']);
    expect(orderedStats[0].firstUserMessage).toBe('First message');
    expect(orderedStats[0].startTime).toBe(1700000001000);
  });

  it('truncates long messages to 100 chars', () => {
    const longMsg = 'A'.repeat(150);
    const rows = [makeMessageRow('conv-1', longMsg, 1700000000000)];
    const { orderedStats } = parse(rows, ['conv-1']);
    expect(orderedStats[0].firstUserMessage).toBe('A'.repeat(100) + '...');
  });

  it('accumulates cost from LLM spans with non-eval generation types', () => {
    const rows = [makeLlmRow('conv-1', { cost: 0.005 }), makeLlmRow('conv-1', { cost: 0.003 })];
    const { orderedStats } = parse(rows, ['conv-1']);
    expect(orderedStats[0].totalEstimatedCostUsd).toBeCloseTo(0.008);
  });

  it('ignores cost from eval generation types', () => {
    const rows = [makeLlmRow('conv-1', { cost: 0.01, generationType: 'eval_scoring' })];
    const { orderedStats } = parse(rows, ['conv-1']);
    expect(orderedStats[0].totalEstimatedCostUsd).toBeUndefined();
  });

  it('ignores cost from non-LLM operation IDs', () => {
    const rows = [makeLlmRow('conv-1', { cost: 0.01, operationId: 'some.other.op' })];
    const { orderedStats } = parse(rows, ['conv-1']);
    expect(orderedStats[0].totalEstimatedCostUsd).toBeUndefined();
  });

  it('extracts metadata from the first span per conversation', () => {
    const rows = [makeLlmRow('conv-1', { timestamp: 1700000001000 })];
    (rows[0] as any)[SPAN_KEYS.AGENT_ID] = 'my-agent';
    (rows[0] as any)[SPAN_KEYS.AGENT_NAME] = 'My Agent';
    (rows[0] as any)[SPAN_KEYS.TENANT_ID] = 'my-tenant';

    const { orderedStats } = parse(rows, ['conv-1']);
    expect(orderedStats[0].agentId).toBe('my-agent');
    expect(orderedStats[0].agentName).toBe('My Agent');
    expect(orderedStats[0].tenantId).toBe('my-tenant');
  });

  it('defaults metadata to UNKNOWN_VALUE when not present', () => {
    const row = {
      [SPAN_KEYS.CONVERSATION_ID]: 'conv-1',
      [SPAN_KEYS.NAME]: 'some.span',
      [SPAN_KEYS.TIMESTAMP]: 1700000000000,
      [SPAN_KEYS.HAS_ERROR]: false,
    };
    const { orderedStats } = parse([row], ['conv-1']);
    expect(orderedStats[0].agentId).toBe(UNKNOWN_VALUE);
    expect(orderedStats[0].agentName).toBe(UNKNOWN_VALUE);
    expect(orderedStats[0].tenantId).toBe(UNKNOWN_VALUE);
  });

  it('handles multiple conversations independently', () => {
    const rows = [
      makeToolCallRow('conv-1', 'search'),
      makeToolCallRow('conv-2', 'fetch'),
      makeToolCallRow('conv-2', 'fetch'),
      makeErrorRow('conv-1', 'agent.generate'),
      makeMessageRow('conv-1', 'Hello', 1700000001000),
      makeMessageRow('conv-2', 'Hi there', 1700000002000),
    ];
    const { orderedStats } = parse(rows, ['conv-1', 'conv-2']);
    expect(orderedStats).toHaveLength(2);

    const conv1 = orderedStats.find((s: any) => s.conversationId === 'conv-1');
    const conv2 = orderedStats.find((s: any) => s.conversationId === 'conv-2');

    expect(conv1.totalToolCalls).toBe(1);
    expect(conv1.totalErrors).toBe(1);
    expect(conv1.firstUserMessage).toBe('Hello');

    expect(conv2.totalToolCalls).toBe(2);
    expect(conv2.totalErrors).toBe(0);
    expect(conv2.firstUserMessage).toBe('Hi there');
  });

  it('handles hasError as string "true" (SigNoz serialization)', () => {
    const row = {
      [SPAN_KEYS.CONVERSATION_ID]: 'conv-1',
      [SPAN_KEYS.NAME]: 'agent.generate',
      [SPAN_KEYS.HAS_ERROR]: 'true',
      [SPAN_KEYS.AGENT_ID]: 'agent-1',
      [SPAN_KEYS.TENANT_ID]: 'tenant-1',
      [SPAN_KEYS.TIMESTAMP]: 1700000000000,
    };
    const { orderedStats } = parse([row], ['conv-1']);
    expect(orderedStats[0].totalErrors).toBe(1);
  });
});
