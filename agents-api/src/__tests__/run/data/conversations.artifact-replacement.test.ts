import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@inkeep/agents-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@inkeep/agents-core')>();
  return {
    ...actual,
    getLedgerArtifacts: vi.fn(),
    getConversationHistory: vi.fn(),
    loadEnvironmentFiles: vi.fn(),
  };
});

vi.mock('../../../data/db/runDbClient', () => ({ default: {} }));

vi.mock('../../../logger', () => createMockLoggerModule().module);

vi.mock('../../../domains/run/compression/ConversationCompressor', () => ({
  ConversationCompressor: vi.fn(),
}));

const mockBlobDownload = vi.fn();

vi.mock('../../../domains/run/services/blob-storage', () => ({
  isBlobUri: (value: string) => value.startsWith('blob://'),
  fromBlobUri: (value: string) => value.slice('blob://'.length),
  getBlobStorageProvider: () => ({
    download: mockBlobDownload,
  }),
}));

import { getConversationHistory, getLedgerArtifacts } from '@inkeep/agents-core';
import { getConversationHistoryWithCompression } from '../../../domains/run/data/conversations';

const mockGetLedgerArtifacts = vi.mocked(getLedgerArtifacts);
const mockGetConversationHistory = vi.mocked(getConversationHistory);

const baseParams = {
  tenantId: 'tenant-1',
  projectId: 'project-1',
  conversationId: 'conv-1',
};

function makeToolResultMessage(toolCallId: string, content: string, toolArgs?: any) {
  return {
    id: `msg-${toolCallId}`,
    role: 'assistant',
    messageType: 'tool-result',
    content: { text: content },
    visibility: 'internal',
    createdAt: new Date().toISOString(),
    metadata: {
      a2a_metadata: {
        toolCallId,
        toolName: 'test_tool',
        toolArgs: toolArgs ?? { query: 'test' },
      },
    },
  };
}

function makeChatMessage(text: string) {
  return {
    id: 'msg-chat',
    role: 'user',
    messageType: 'chat',
    content: { text },
    visibility: 'external',
    createdAt: new Date().toISOString(),
    metadata: {},
  };
}

describe('getConversationHistoryWithCompression — artifact replacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConversationHistory.mockReturnValue(vi.fn().mockResolvedValue([]));
    mockBlobDownload.mockReset();
  });

  it('replaces tool-result content with compact artifact reference', async () => {
    const rawContent = 'x'.repeat(50000);
    const messages = [
      makeChatMessage('What is in the doc?'),
      makeToolResultMessage('tc-1', rawContent, { fileId: 'doc-abc' }),
    ];

    mockGetConversationHistory.mockReturnValue(vi.fn().mockResolvedValue(messages));
    mockGetLedgerArtifacts.mockReturnValue(
      vi.fn().mockResolvedValue([
        {
          artifactId: 'art-1',
          toolCallId: 'tc-1',
          name: 'Google Doc',
          description: 'Fetched document content',
          parts: [
            {
              kind: 'data',
              data: { summary: { title: 'My Doc', preview: 'First lines...' } },
            },
          ],
          metadata: {},
          createdAt: new Date().toISOString(),
        },
      ])
    );

    const result = await getConversationHistoryWithCompression(baseParams);

    const toolResult = result.find((msg) => msg.messageType === 'tool-result');
    const toolResultText = toolResult?.content?.text ?? '';

    expect(toolResultText).toContain('Artifact: "Google Doc"');
    expect(toolResultText).toContain('id: art-1');
    expect(toolResultText).toContain('Tool call args:');
    expect(toolResultText).toContain('description: Fetched document content');
    expect(toolResultText).toContain('summary:');
    expect(toolResultText).not.toContain(rawContent);
  });

  it('batches toolCallId lookups in a single getLedgerArtifacts call', async () => {
    const messages = [
      makeToolResultMessage('tc-1', 'result 1'),
      makeToolResultMessage('tc-2', 'result 2'),
      makeToolResultMessage('tc-3', 'result 3'),
    ];

    mockGetConversationHistory.mockReturnValue(vi.fn().mockResolvedValue(messages));
    const innerFn = vi.fn().mockResolvedValue([]);
    mockGetLedgerArtifacts.mockReturnValue(innerFn);

    await getConversationHistoryWithCompression(baseParams);

    expect(mockGetLedgerArtifacts).toHaveBeenCalledTimes(1);
    expect(innerFn).toHaveBeenCalledWith({
      scopes: { tenantId: 'tenant-1', projectId: 'project-1' },
      toolCallIds: expect.arrayContaining(['tc-1', 'tc-2', 'tc-3']),
    });
  });

  it('leaves tool-result unchanged when no matching artifact exists', async () => {
    const content = 'small tool result';
    const messages = [makeToolResultMessage('tc-no-artifact', content)];

    mockGetConversationHistory.mockReturnValue(vi.fn().mockResolvedValue(messages));
    mockGetLedgerArtifacts.mockReturnValue(vi.fn().mockResolvedValue([]));

    const result = await getConversationHistoryWithCompression(baseParams);

    const toolResult = result.find((msg) => msg.messageType === 'tool-result');
    const toolResultText = toolResult?.content?.text ?? '';

    expect(toolResultText).toContain(content);
    expect(toolResultText).not.toContain('Artifact:');
  });

  it('preserves all artifact references when multiple artifacts share a toolCallId', async () => {
    const rawContent = 'raw tool output';
    const messages = [makeToolResultMessage('tc-shared', rawContent)];

    mockGetConversationHistory.mockReturnValue(vi.fn().mockResolvedValue(messages));
    mockGetLedgerArtifacts.mockReturnValue(
      vi.fn().mockResolvedValue([
        {
          artifactId: 'art-1',
          toolCallId: 'tc-shared',
          name: 'First',
          description: 'First artifact',
          parts: [{ kind: 'data', data: { summary: { text: 'one' } } }],
          metadata: {},
          createdAt: new Date().toISOString(),
        },
        {
          artifactId: 'art-2',
          toolCallId: 'tc-shared',
          name: 'Second',
          description: 'Second artifact',
          parts: [{ kind: 'data', data: { summary: { text: 'two' } } }],
          metadata: {},
          createdAt: new Date().toISOString(),
        },
      ])
    );

    const result = await getConversationHistoryWithCompression(baseParams);
    const toolResult = result.find((msg) => msg.messageType === 'tool-result');
    const toolResultText = toolResult?.content?.text ?? '';

    expect(toolResultText).not.toContain(rawContent);
    expect(toolResultText).toContain('Tool call args:');
    expect(toolResultText.match(/Tool call args:/g)?.length).toBe(1);
    const argsJson = JSON.stringify({ query: 'test' });
    expect(toolResultText.split(argsJson).length - 1).toBe(1);

    expect(toolResultText).toContain('Artifact: "First"');
    expect(toolResultText).toContain('Artifact: "Second"');
    expect(toolResultText).toContain('id: art-1');
    expect(toolResultText).toContain('id: art-2');
    expect(toolResultText).toContain('description: First artifact');
    expect(toolResultText).toContain('description: Second artifact');
    expect(toolResultText).toMatch(/\]\s*\n\n\[/);
  });
});
