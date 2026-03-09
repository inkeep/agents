import type { MessageContent } from '@inkeep/agents-core';
import { describe, expect, it, vi } from 'vitest';
import {
  resolveMessageBlobUris,
  resolveMessagesListBlobUris,
} from '../blob-storage/resolve-blob-uris';

vi.mock('../../../../env', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
  },
}));

describe('resolveMessageBlobUris', () => {
  it('resolves blob file parts to media proxy URLs', () => {
    const content: MessageContent = {
      text: 'Hello',
      parts: [
        { kind: 'text', text: 'Hello' },
        {
          kind: 'file',
          data: 'blob://v1/t_tenant/media/p_project/conv/c_conversation/m_msg/sha256-hash.png',
          metadata: { mimeType: 'image/png' },
        },
      ],
    };

    const resolved = resolveMessageBlobUris(content);

    expect(resolved.parts).toHaveLength(2);
    expect(resolved.parts?.[0]).toEqual({ kind: 'text', text: 'Hello' });
    expect(resolved.parts?.[1]).toEqual({
      kind: 'file',
      data: 'http://localhost:3002/manage/tenants/tenant/projects/project/conversations/conversation/media/m_msg%2Fsha256-hash.png',
      metadata: { mimeType: 'image/png' },
    });
  });

  it('uses provided base URL override when specified', () => {
    const content: MessageContent = {
      text: 'Hello',
      parts: [
        {
          kind: 'file',
          data: 'blob://v1/t_tenant/media/p_project/conv/c_conversation/m_msg/sha256-hash.png',
          metadata: { mimeType: 'image/png' },
        },
      ],
    };

    const resolved = resolveMessageBlobUris(content, 'https://api.example.com');

    expect(resolved.parts?.[0]).toEqual({
      kind: 'file',
      data: 'https://api.example.com/manage/tenants/tenant/projects/project/conversations/conversation/media/m_msg%2Fsha256-hash.png',
      metadata: { mimeType: 'image/png' },
    });
  });

  it('returns content unchanged when there are no parts', () => {
    const content: MessageContent = { text: 'Hello' };
    expect(resolveMessageBlobUris(content)).toEqual(content);
  });

  it('returns non-blob file URIs unchanged', () => {
    const content: MessageContent = {
      text: 'Hello',
      parts: [
        {
          kind: 'file',
          data: 'https://example.com/image.png',
          metadata: { mimeType: 'image/png' },
        },
      ],
    };

    expect(resolveMessageBlobUris(content)).toEqual(content);
  });

  it('filters malformed blob keys that do not include tenant/project/conversation', () => {
    const content: MessageContent = {
      text: 'Hello',
      parts: [
        { kind: 'text', text: 'keep-me' },
        {
          kind: 'file',
          data: 'blob://too-short/key',
          metadata: { mimeType: 'image/png' },
        },
      ],
    };

    const resolved = resolveMessageBlobUris(content);
    expect(resolved.parts).toEqual([{ kind: 'text', text: 'keep-me' }]);
  });
});

describe('resolveMessagesListBlobUris', () => {
  it('resolves blob URIs for each message in the list', () => {
    const messages = [
      {
        id: 'msg-1',
        content: {
          text: 'Hello',
          parts: [
            {
              kind: 'file',
              data: 'blob://v1/t_tenant/media/p_project/conv/c_conversation/m_msg/sha256-hash.png',
              metadata: { mimeType: 'image/png' },
            },
          ],
        },
      },
      {
        id: 'msg-2',
        content: { text: 'No file parts' },
      },
    ];

    const resolved = resolveMessagesListBlobUris(messages);

    expect(resolved[0].content.parts?.[0]).toEqual({
      kind: 'file',
      data: 'http://localhost:3002/manage/tenants/tenant/projects/project/conversations/conversation/media/m_msg%2Fsha256-hash.png',
      metadata: { mimeType: 'image/png' },
    });
    expect(resolved[1].content).toEqual({ text: 'No file parts' });
  });
});
