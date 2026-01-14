import { describe, expect, it } from 'vitest';
import { extractToolApprovalResponseFromChatMessages } from '../../utils/tool-approval';

describe('extractToolApprovalResponseFromChatMessages', () => {
  it('returns undefined when no approval response is present', () => {
    expect(extractToolApprovalResponseFromChatMessages([{ role: 'user', parts: [] } as any])).toBe(
      undefined
    );
  });

  it('extracts approval response from assistant tool part (ui messages)', () => {
    const result = extractToolApprovalResponseFromChatMessages([
      {
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-delete_file',
            toolCallId: 'call_123',
            state: 'approval-responded',
            input: { filePath: '/tmp/test.txt' },
            approval: { id: 'aitxt-abc', approved: true },
          },
        ],
      },
    ] as any);

    expect(result).toEqual({
      approvalId: 'aitxt-abc',
      approved: true,
      toolCallId: 'call_123',
      toolName: 'delete_file',
    });
  });
});
