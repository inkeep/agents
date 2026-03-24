import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../logger', () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

import { buildUserMessageContent } from '../../../domains/run/agents/generation/conversation-history';

describe('buildUserMessageContent', () => {
  it('injects inline text attachments as XML attachment blocks', async () => {
    const content = await buildUserMessageContent('Please summarize this', [
      {
        kind: 'file',
        file: {
          bytes: Buffer.from('# Title\r\n\r\nHello world', 'utf8').toString('base64'),
          mimeType: 'text/markdown',
        },
        metadata: {
          filename: 'notes.md',
        },
      },
    ]);

    expect(content).toEqual([
      { type: 'text', text: 'Please summarize this' },
      {
        type: 'text',
        text: [
          '<attached_file filename="notes.md" media_type="text/markdown">',
          '# Title',
          '',
          'Hello world',
          '</attached_file>',
        ].join('\n'),
      },
    ]);
  });
});
