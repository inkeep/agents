import { describe, expect, it, vi } from 'vitest';

const { downloadMock } = vi.hoisted(() => ({ downloadMock: vi.fn() }));

vi.mock('../../../../logger', () => ({
  getLogger: () => ({ warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

vi.mock('../../../domains/run/services/blob-storage', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../domains/run/services/blob-storage')>();
  return { ...actual, getBlobStorageProvider: () => ({ download: downloadMock }) };
});

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

  it('downloads and injects blob-backed text attachments', async () => {
    downloadMock.mockResolvedValue({
      data: Buffer.from('# Title\n\nHello from blob', 'utf8'),
      mimeType: 'text/markdown',
    });

    const content = await buildUserMessageContent('Summarize this', [
      {
        kind: 'file',
        file: {
          uri: 'blob://v1/t_tenant/media/p_proj/conv/c_conv/m_msg/sha256-abc123',
          mimeType: 'text/markdown',
        },
        metadata: { filename: 'notes.md' },
      },
    ]);

    expect(downloadMock).toHaveBeenCalledWith(
      'v1/t_tenant/media/p_proj/conv/c_conv/m_msg/sha256-abc123'
    );
    expect(content).toEqual([
      { type: 'text', text: 'Summarize this' },
      {
        type: 'text',
        text: [
          '<attached_file filename="notes.md" media_type="text/markdown">',
          '# Title',
          '',
          'Hello from blob',
          '</attached_file>',
        ].join('\n'),
      },
    ]);
  });

  it('injects inline JSON attachments as XML attachment blocks', async () => {
    const content = await buildUserMessageContent('Summarize this payload', [
      {
        kind: 'file',
        file: {
          bytes: Buffer.from('{"items":[1,2,3]}\n', 'utf8').toString('base64'),
          mimeType: 'application/json',
        },
        metadata: {
          filename: 'payload.json',
        },
      },
    ]);

    expect(content).toEqual([
      { type: 'text', text: 'Summarize this payload' },
      {
        type: 'text',
        text: [
          '<attached_file filename="payload.json" media_type="application/json">',
          '{"items":[1,2,3]}',
          '',
          '</attached_file>',
        ].join('\n'),
      },
    ]);
  });

  it('returns unavailable block when blob download fails', async () => {
    downloadMock.mockRejectedValue(new Error('Blob not found'));

    const content = await buildUserMessageContent('Summarize this', [
      {
        kind: 'file',
        file: {
          uri: 'blob://v1/t_tenant/media/p_proj/conv/c_conv/m_msg/sha256-abc123',
          mimeType: 'text/markdown',
        },
        metadata: { filename: 'notes.md' },
      },
    ]);

    expect(content).toEqual([
      { type: 'text', text: 'Summarize this' },
      {
        type: 'text',
        text: expect.stringContaining('[Attachment unavailable]'),
      },
    ]);
  });
});
