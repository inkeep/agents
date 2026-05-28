import { createMockLoggerModule } from '@inkeep/agents-core/test-utils';
import { describe, expect, it, vi } from 'vitest';

const { downloadMock } = vi.hoisted(() => ({ downloadMock: vi.fn() }));

vi.mock('../../../../logger', () => createMockLoggerModule().module);

vi.mock('../../../domains/run/services/blob-storage', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../domains/run/services/blob-storage')>();
  return { ...actual, getBlobStorageProvider: () => ({ download: downloadMock }) };
});

import {
  buildInitialMessages,
  buildUserMessageContent,
} from '../../../domains/run/agents/generation/conversation-history';

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

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

  it('passes ZIP-based binary document attachments through as file content parts', async () => {
    const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Array(8).fill(0)]).toString('base64');

    const content = await buildUserMessageContent('Review this deck', [
      {
        kind: 'file',
        file: {
          bytes: zipBytes,
          mimeType: PPTX_MIME,
        },
        metadata: {
          filename: 'deck.pptx',
        },
      },
    ]);

    expect(content).toEqual([
      { type: 'text', text: 'Review this deck' },
      {
        type: 'file',
        data: `data:${PPTX_MIME};base64,${zipBytes}`,
        mediaType: PPTX_MIME,
        filename: 'deck.pptx',
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

describe('buildInitialMessages', () => {
  const ARTIFACTS_XML = '<artifact id="a1"><name>Test Documentation</name></artifact>';

  it('places artifacts as a user-role message between history and the new user message', async () => {
    const messages = await buildInitialMessages(
      'SYSTEM RULES',
      'prior conversation history',
      'what is the status?',
      undefined,
      ARTIFACTS_XML
    );

    expect(messages).toHaveLength(4);
    expect(messages[0]).toEqual({ role: 'system', content: 'SYSTEM RULES' });
    expect(messages[1]).toEqual({ role: 'user', content: 'prior conversation history' });
    expect(messages[2]).toEqual({ role: 'user', content: ARTIFACTS_XML });
    expect(messages[3]).toEqual({ role: 'user', content: 'what is the status?' });
  });

  it('keeps the 3-message shape when artifactsMessage is null', async () => {
    const messages = await buildInitialMessages(
      'SYSTEM RULES',
      'prior conversation history',
      'what is the status?',
      undefined,
      null
    );

    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'user']);
    expect(messages[1]).toEqual({ role: 'user', content: 'prior conversation history' });
    expect(messages[2]).toEqual({ role: 'user', content: 'what is the status?' });
  });

  it('defaults to the 3-message shape when artifactsMessage is omitted', async () => {
    const messages = await buildInitialMessages(
      'SYSTEM RULES',
      'prior conversation history',
      'what is the status?'
    );

    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'user']);
  });

  it('keeps per-artifact XML in the artifacts message, not the system message', async () => {
    const systemPrompt = 'SYSTEM RULES with static artifact instructions but no per-artifact XML';

    const messages = await buildInitialMessages(
      systemPrompt,
      'history',
      'question',
      undefined,
      ARTIFACTS_XML
    );

    expect(messages[0].content).toBe(systemPrompt);
    expect(messages[0].content).not.toContain('<name>Test Documentation</name>');
    expect(messages[2]).toEqual({ role: 'user', content: ARTIFACTS_XML });
  });

  it('inserts the artifacts message even when there is no conversation history', async () => {
    const messages = await buildInitialMessages(
      'SYSTEM RULES',
      '',
      'question',
      undefined,
      ARTIFACTS_XML
    );

    expect(messages).toHaveLength(3);
    expect(messages[0].role).toBe('system');
    expect(messages[1]).toEqual({ role: 'user', content: ARTIFACTS_XML });
    expect(messages[2]).toEqual({ role: 'user', content: 'question' });
  });

  it('omits an empty-string artifactsMessage', async () => {
    const messages = await buildInitialMessages(
      'SYSTEM RULES',
      'history',
      'question',
      undefined,
      '   '
    );

    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.role)).toEqual(['system', 'user', 'user']);
  });
});
