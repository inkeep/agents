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

vi.mock('../../../logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

vi.mock('../../../domains/run/services/ConversationCompressor', () => ({
  ConversationCompressor: vi.fn(),
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

    expect(result).toContain('Artifact: "Google Doc"');
    expect(result).toContain('id: art-1');
    expect(result).toContain('args:');
    expect(result).toContain('description: Fetched document content');
    expect(result).toContain('summary:');
    expect(result).not.toContain(rawContent);
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

    expect(result).toContain(content);
    expect(result).not.toContain('Artifact:');
  });
});
