import { beforeEach, describe, expect, it, vi } from 'vitest';

const refs = vi.hoisted(() => ({ mockLogger: null as any }));

vi.mock('../../../../../logger', async () => {
  const { createMockLoggerModule } = await import('@inkeep/agents-core/test-utils');
  const result = createMockLoggerModule();
  refs.mockLogger = result.mockLogger;
  return result.module;
});

vi.mock('../../../../session/AgentSession', () => ({
  agentSessionManager: {
    getSession: vi.fn(),
    recordEvent: vi.fn(),
    updateArtifactComponents: vi.fn(),
  },
  toolSessionManager: {
    recordToolCall: vi.fn(),
    recordToolResult: vi.fn(),
    getToolResult: vi.fn(),
  },
}));

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    createMessage: vi.fn(),
    generateId: vi.fn().mockReturnValue('gen-id'),
    parseEmbeddedJson: vi.fn(),
    unwrapError: vi.fn((e: any) => e),
    getLedgerArtifacts: vi.fn(),
    loadEnvironmentFiles: vi.fn(),
  };
});

vi.mock('../../../services/blob-storage/artifact-binary-sanitizer', () => ({
  stripBinaryDataForObservability: vi.fn((d: any) => d),
}));

vi.mock('../../../../data/db/runDbClient', () => ({
  default: {},
}));

vi.mock('../../generation/tool-result-for-conversation-history', () => ({
  buildToolResultForConversationHistory: vi.fn().mockReturnValue('conv-history-result'),
}));

const mockBuildToolResultForModelInput = vi.fn().mockReturnValue({
  type: 'text',
  value: 'normal result',
});
vi.mock('../../generation/tool-result-for-model-input', () => ({
  buildToolResultForModelInput: (...args: any[]) => mockBuildToolResultForModelInput(...args),
}));

vi.mock('../../../utils/agent-operations', () => ({
  generateToolId: vi.fn().mockReturnValue('tool-call-123'),
}));

vi.mock('../../../utils/select-filter', () => ({
  stripInternalFields: vi.fn((d: any) => d),
}));

vi.mock('../../../utils/tool-result', () => ({
  isToolResultDenied: vi.fn().mockReturnValue(false),
}));

vi.mock('../tool-utils', () => ({
  getRelationshipIdForTool: vi.fn().mockReturnValue('rel-123'),
}));

vi.mock('../../../constants/artifact-syntax', () => ({
  SENTINEL_KEY: '__sentinel__',
}));

import { wrapToolWithStreaming } from '../tool-wrapper';

function makeCtx(): any {
  return {
    config: {
      id: 'sub-1',
      name: 'test-agent',
      agentId: 'agent-1',
      tenantId: 'tenant-1',
      projectId: 'project-1',
    },
    conversationId: 'conv-1',
    isDelegatedAgent: false,
    streamHelper: undefined,
    functionToolRelationshipIdByName: new Map(),
    taskDenialRedirects: [],
  };
}

function makeToolDefinition(output: unknown) {
  return {
    description: 'Test tool',
    parameters: { type: 'object', properties: {} },
    execute: vi.fn().mockResolvedValue(output),
  };
}

describe('tool-wrapper oversized exclusion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns structured oversized stub when output exceeds context window', () => {
    const largeOutput = 'x'.repeat(200_000);
    const ctx = makeCtx();
    const wrapped = wrapToolWithStreaming(ctx, 'big_tool', makeToolDefinition(largeOutput) as any);

    const result = (wrapped as any).toModelOutput({ output: largeOutput });

    expect(result.type).toBe('json');
    expect(result.value.status).toBe('oversized');
    expect(result.value.toolName).toBe('big_tool');
    expect(result.value.reason).toContain('tokens');
    expect(result.value.toolInfo).toBeDefined();
    expect(result.value.recommendation).toContain('narrowing');
    expect(mockBuildToolResultForModelInput).not.toHaveBeenCalled();
  });

  it('falls through to buildToolResultForModelInput for non-oversized output', () => {
    const ctx = makeCtx();
    const wrapped = wrapToolWithStreaming(ctx, 'small_tool', makeToolDefinition('small') as any);

    const result = (wrapped as any).toModelOutput({ output: 'small' });

    expect(mockBuildToolResultForModelInput).toHaveBeenCalledWith('small');
    expect(result).toEqual({ type: 'text', value: 'normal result' });
  });

  it('stub payload contains toolName, toolArgs, structureInfo, recommendation', async () => {
    const largeOutput = JSON.stringify({ data: 'x'.repeat(200_000) });
    const ctx = makeCtx();
    const toolDef = makeToolDefinition(largeOutput) as any;
    const wrapped = wrapToolWithStreaming(ctx, 'search_tool', toolDef);

    await (wrapped as any).execute({ query: 'test' }, { toolCallId: 'tc-1' });
    const result = (wrapped as any).toModelOutput({ output: largeOutput });

    expect(result.value.status).toBe('oversized');
    expect(result.value.toolInfo.toolName).toBe('search_tool');
    expect(result.value.toolInfo.toolArgs).toEqual({ query: 'test' });
    expect(typeof result.value.toolInfo.structureInfo).toBe('string');
    expect(result.value.recommendation).toBeDefined();
    expect(result.value.toolCallId).toBe('tc-1');
  });
});
