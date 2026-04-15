import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist mocks before any imports
// ---------------------------------------------------------------------------

const { buildInitialMessagesMock, buildConversationHistoryMock } = vi.hoisted(() => ({
  buildInitialMessagesMock: vi.fn().mockResolvedValue([]),
  buildConversationHistoryMock: vi.fn().mockResolvedValue({
    conversationHistory: [],
    contextBreakdown: { components: {}, total: 0 },
  }),
}));

vi.mock('../../../../logger', () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

vi.mock('ai', () => ({
  generateText: vi.fn().mockResolvedValue({
    text: 'ok',
    toolCalls: [],
    finishReason: 'stop',
    usage: { inputTokens: 10, outputTokens: 5 },
    totalUsage: { inputTokens: 10, outputTokens: 5 },
    steps: [],
  }),
  streamText: vi.fn(),
  Output: { object: vi.fn() },
}));

vi.mock('../../../domains/run/agents/generation/conversation-history', () => ({
  buildInitialMessages: buildInitialMessagesMock,
  buildConversationHistory: buildConversationHistoryMock,
}));

vi.mock('../../../domains/run/agents/generation/model-config', () => ({
  configureModelSettings: vi.fn().mockReturnValue({
    primaryModelSettings: { model: 'anthropic/claude-3-5-sonnet-20241022' },
    modelSettings: { model: 'mocked-model', maxDuration: 60 },
    hasStructuredOutput: false,
    timeoutMs: 60000,
  }),
}));

vi.mock('../../../domains/run/agents/generation/tool-loading', () => ({
  loadToolsAndPrompts: vi.fn().mockResolvedValue({
    systemPrompt: 'You are a helpful assistant.',
    sanitizedTools: {},
    contextBreakdown: { components: {}, total: 0 },
  }),
}));

vi.mock('../../../domains/run/agents/generation/compression', () => ({
  setupCompression: vi.fn().mockReturnValue({ originalMessageCount: 0, compressor: null }),
}));

vi.mock('../../../domains/run/agents/generation/response-formatting', () => ({
  formatFinalResponse: vi.fn().mockResolvedValue({
    text: 'ok',
    formattedContent: { parts: [] },
  }),
}));

vi.mock('../../../domains/run/agents/generation/schema-builder', () => ({
  buildDataComponentsSchema: vi.fn().mockReturnValue(null),
}));

vi.mock('../../../domains/run/agents/generation/ai-sdk-callbacks', () => ({
  handlePrepareStepCompression: vi.fn().mockResolvedValue(undefined),
  handleStopWhenConditions: vi.fn().mockResolvedValue(false),
}));

vi.mock('../../../domains/run/utils/tracer', () => ({
  tracer: {
    startActiveSpan: vi.fn((_name: string, _attrs: unknown, fn: (span: any) => any) =>
      fn({
        setAttributes: vi.fn(),
        setAttribute: vi.fn(),
        setStatus: vi.fn(),
        end: vi.fn(),
      })
    ),
  },
  setSpanWithError: vi.fn(),
}));

vi.mock('../../../domains/run/session/AgentSession', () => ({
  agentSessionManager: {
    updateArtifactComponents: vi.fn(),
    recordEvent: vi.fn(),
  },
}));

vi.mock('../../../domains/run/stream/stream-registry', () => ({
  getStreamHelper: vi.fn().mockReturnValue(undefined),
}));

vi.mock('../../../domains/run/utils/json-postprocessor', () => ({
  withJsonPostProcessing: vi.fn((config: unknown) => config),
}));

vi.mock('../../../domains/run/agents/agent-types', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    resolveGenerationResponse: vi.fn().mockResolvedValue({
      text: 'ok',
      finishReason: 'stop',
      steps: [],
      usage: { inputTokens: 10, outputTokens: 5 },
      totalUsage: { inputTokens: 10, outputTokens: 5 },
    }),
    hasToolCallWithPrefix: vi.fn().mockReturnValue(() => false),
  };
});

vi.mock('../../../domains/run/agents/versions/v1/PromptConfig', () => ({
  V1_BREAKDOWN_SCHEMA: [],
}));

// ---------------------------------------------------------------------------
// Import under test (after all mocks are registered)
// ---------------------------------------------------------------------------

import { runGenerate } from '../../../domains/run/agents/generation/generate';

// ---------------------------------------------------------------------------
// Minimal context fixture
// ---------------------------------------------------------------------------

function makeCtx(): any {
  return {
    config: {
      id: 'sub-agent',
      tenantId: 'test-tenant',
      projectId: 'test-project',
      agentId: 'agent',
      agentName: 'Test Agent',
      name: 'Sub Agent',
      baseUrl: 'http://localhost',
      subAgentRelations: [],
      transferRelations: [],
      delegateRelations: [],
      dataComponents: [],
      artifactComponents: [],
      models: {
        base: { model: 'anthropic/claude-3-5-sonnet-20241022' },
      },
    },
    isDelegatedAgent: false,
    artifactComponents: [],
    currentCompressor: null,
    functionToolRelationshipIdByName: new Map(),
    taskDenialRedirects: [],
    streamHelper: undefined,
    streamRequestId: undefined,
    conversationId: undefined,
    systemPromptBuilder: { build: vi.fn().mockReturnValue('') },
  };
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function makeFilePart(mimeType: string, filename?: string): any {
  return {
    kind: 'file',
    file: { mimeType, bytes: 'dGVzdA==' },
    ...(filename ? { metadata: { filename } } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runGenerate — strip + warn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildInitialMessagesMock.mockResolvedValue([]);
    buildConversationHistoryMock.mockResolvedValue({
      conversationHistory: [],
      contextBreakdown: { components: {}, total: 0 },
    });
  });

  it('strips docx part and injects note when model is Claude', async () => {
    const ctx = makeCtx();
    const parts = [
      { kind: 'text' as const, text: 'Summarize this document.' },
      makeFilePart(DOCX_MIME, 'report.docx'),
    ];

    await runGenerate(ctx, parts);

    const [, , userMessageArg, filePartsArg] = buildInitialMessagesMock.mock.calls[0];

    expect(filePartsArg).toHaveLength(0);
    expect(userMessageArg).toContain('Summarize this document.');
    expect(userMessageArg).toContain('[Attachment omitted:');
    expect(userMessageArg).toContain('"report.docx"');
    expect(userMessageArg).toContain(DOCX_MIME);
    expect(userMessageArg).toContain('anthropic/claude-3-5-sonnet-20241022');
  });

  it('strips xlsx part and injects note when model is Claude', async () => {
    const ctx = makeCtx();
    const parts = [
      { kind: 'text' as const, text: 'Summarize this spreadsheet.' },
      makeFilePart(XLSX_MIME, 'data.xlsx'),
    ];

    await runGenerate(ctx, parts);

    const [, , userMessageArg, filePartsArg] = buildInitialMessagesMock.mock.calls[0];

    expect(filePartsArg).toHaveLength(0);
    expect(userMessageArg).toContain('"data.xlsx"');
    expect(userMessageArg).toContain(XLSX_MIME);
  });

  it('keeps PDF parts and only strips office doc parts', async () => {
    const ctx = makeCtx();
    const pdfPart = makeFilePart('application/pdf', 'doc.pdf');
    const docxPart = makeFilePart(DOCX_MIME, 'report.docx');
    const parts = [{ kind: 'text' as const, text: 'Review these.' }, pdfPart, docxPart];

    await runGenerate(ctx, parts);

    const [, , userMessageArg, filePartsArg] = buildInitialMessagesMock.mock.calls[0];

    expect(filePartsArg).toHaveLength(1);
    expect(filePartsArg[0]).toBe(pdfPart);
    expect(userMessageArg).toContain('[Attachment omitted:');
    expect(userMessageArg).toContain('report.docx');
  });

  it('does not strip or inject note when model is OpenAI', async () => {
    const { configureModelSettings } = await import(
      '../../../domains/run/agents/generation/model-config'
    );
    vi.mocked(configureModelSettings).mockReturnValueOnce({
      primaryModelSettings: { model: 'openai/gpt-4o' },
      modelSettings: { model: 'mocked-model', maxDuration: 60 },
      hasStructuredOutput: false,
      timeoutMs: 60000,
    });

    const ctx = makeCtx();
    const docxPart = makeFilePart(DOCX_MIME, 'report.docx');
    const parts = [{ kind: 'text' as const, text: 'Summarize this.' }, docxPart];

    await runGenerate(ctx, parts);

    const [, , userMessageArg, filePartsArg] = buildInitialMessagesMock.mock.calls[0];

    expect(filePartsArg).toHaveLength(1);
    expect(filePartsArg[0]).toBe(docxPart);
    expect(userMessageArg).not.toContain('[Attachment omitted:');
  });

  it('does not modify message when there are no file parts', async () => {
    const ctx = makeCtx();
    const parts = [{ kind: 'text' as const, text: 'Hello world.' }];

    await runGenerate(ctx, parts);

    const [, , userMessageArg, filePartsArg] = buildInitialMessagesMock.mock.calls[0];

    expect(filePartsArg).toHaveLength(0);
    expect(userMessageArg).toBe('Hello world.');
    expect(userMessageArg).not.toContain('[Attachment omitted:');
  });
});
