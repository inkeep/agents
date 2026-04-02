import type { MessageContent } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveMessageBlobUris,
  resolveMessagesListBlobUris,
} from '../blob-storage/resolve-blob-uris';

vi.mock('../../../../env', () => ({
  env: {
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
  },
}));

const mockGetPresignedUrl = vi.fn();

vi.mock('../blob-storage/index', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../blob-storage/index')>();
  return {
    ...actual,
    getBlobStorageProvider: vi.fn(() => ({
      getPresignedUrl: undefined,
    })),
  };
});

describe('resolveMessageBlobUris', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves blob file parts to media proxy URLs when presigned URLs are not available', async () => {
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
    });

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

    const resolved = await resolveMessageBlobUris(content);

    expect(resolved.parts).toHaveLength(2);
    expect(resolved.parts?.[0]).toEqual({ kind: 'text', text: 'Hello' });
    expect(resolved.parts?.[1]).toEqual({
      kind: 'file',
      data: 'http://localhost:3002/manage/tenants/tenant/projects/project/conversations/conversation/media/m_msg%2Fsha256-hash.png',
      metadata: { mimeType: 'image/png' },
    });
  });

  it('generates presigned URLs when provider supports getPresignedUrl', async () => {
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    mockGetPresignedUrl.mockResolvedValue(
      'https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc'
    );
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      getPresignedUrl: mockGetPresignedUrl,
    });

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

    const resolved = await resolveMessageBlobUris(content);

    expect(mockGetPresignedUrl).toHaveBeenCalledWith(
      'v1/t_tenant/media/p_project/conv/c_conversation/m_msg/sha256-hash.png'
    );
    expect(resolved.parts?.[0]).toEqual({
      kind: 'file',
      data: 'https://bucket.s3.amazonaws.com/key?X-Amz-Signature=abc',
      metadata: { mimeType: 'image/png' },
    });
  });

  it('falls back to proxy URL when presigned URL generation fails', async () => {
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    mockGetPresignedUrl.mockRejectedValue(new Error('S3 credential expired'));
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      getPresignedUrl: mockGetPresignedUrl,
    });

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

    const resolved = await resolveMessageBlobUris(content);

    expect(resolved.parts?.[0]).toEqual({
      kind: 'file',
      data: 'http://localhost:3002/manage/tenants/tenant/projects/project/conversations/conversation/media/m_msg%2Fsha256-hash.png',
      metadata: { mimeType: 'image/png' },
    });
  });

  it('handles mixed content with presigned URLs active', async () => {
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    mockGetPresignedUrl.mockResolvedValue('https://bucket.s3.amazonaws.com/signed');
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      getPresignedUrl: mockGetPresignedUrl,
    });

    const content: MessageContent = {
      text: 'Mixed',
      parts: [
        { kind: 'text', text: 'Hello' },
        {
          kind: 'file',
          data: 'blob://v1/t_tenant/media/p_project/conv/c_conversation/m_msg/sha256-hash.png',
          metadata: { mimeType: 'image/png' },
        },
        {
          kind: 'file',
          data: 'https://example.com/external.png',
          metadata: { mimeType: 'image/png' },
        },
      ],
    };

    const resolved = await resolveMessageBlobUris(content);

    expect(resolved.parts).toHaveLength(3);
    expect(resolved.parts?.[0]).toEqual({ kind: 'text', text: 'Hello' });
    expect(resolved.parts?.[1]?.data).toBe('https://bucket.s3.amazonaws.com/signed');
    expect(resolved.parts?.[2]?.data).toBe('https://example.com/external.png');
  });

  it('uses provided base URL override when specified', async () => {
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
    });

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

    const resolved = await resolveMessageBlobUris(content, 'https://api.example.com');

    expect(resolved.parts?.[0]).toEqual({
      kind: 'file',
      data: 'https://api.example.com/manage/tenants/tenant/projects/project/conversations/conversation/media/m_msg%2Fsha256-hash.png',
      metadata: { mimeType: 'image/png' },
    });
  });

  it('returns content unchanged when there are no parts', async () => {
    const content: MessageContent = { text: 'Hello' };
    expect(await resolveMessageBlobUris(content)).toEqual(content);
  });

  it('returns non-blob file URIs unchanged', async () => {
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
    });

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

    expect(await resolveMessageBlobUris(content)).toEqual(content);
  });

  it('filters malformed blob keys that do not include tenant/project/conversation', async () => {
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
    });

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

    const resolved = await resolveMessageBlobUris(content);
    expect(resolved.parts).toEqual([{ kind: 'text', text: 'keep-me' }]);
  });
});

describe('resolveMessagesListBlobUris', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves blob URIs for each message in the list', async () => {
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
    });

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

    const resolved = await resolveMessagesListBlobUris(messages);

    expect(resolved[0].content.parts?.[0]).toEqual({
      kind: 'file',
      data: 'http://localhost:3002/manage/tenants/tenant/projects/project/conversations/conversation/media/m_msg%2Fsha256-hash.png',
      metadata: { mimeType: 'image/png' },
    });
    expect(resolved[1].content).toEqual({ text: 'No file parts' });
  });

  it('resolves presigned URLs for multiple messages in a list', async () => {
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    mockGetPresignedUrl
      .mockResolvedValueOnce('https://bucket.s3.amazonaws.com/signed-1')
      .mockResolvedValueOnce('https://bucket.s3.amazonaws.com/signed-2');
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: vi.fn(),
      download: vi.fn(),
      delete: vi.fn(),
      getPresignedUrl: mockGetPresignedUrl,
    });

    const messages = [
      {
        id: 'msg-1',
        content: {
          text: 'First',
          parts: [
            {
              kind: 'file',
              data: 'blob://v1/t_tenant/media/p_project/conv/c_conversation/m_msg1/hash1.png',
              metadata: { mimeType: 'image/png' },
            },
          ],
        },
      },
      {
        id: 'msg-2',
        content: {
          text: 'Second',
          parts: [
            {
              kind: 'file',
              data: 'blob://v1/t_tenant/media/p_project/conv/c_conversation/m_msg2/hash2.pdf',
              metadata: { mimeType: 'application/pdf' },
            },
          ],
        },
      },
      {
        id: 'msg-3',
        content: { text: 'No attachments' },
      },
    ];

    const resolved = await resolveMessagesListBlobUris(messages);

    expect(resolved[0].content.parts?.[0]?.data).toBe('https://bucket.s3.amazonaws.com/signed-1');
    expect(resolved[1].content.parts?.[0]?.data).toBe('https://bucket.s3.amazonaws.com/signed-2');
    expect(resolved[2].content).toEqual({ text: 'No attachments' });
    expect(mockGetPresignedUrl).toHaveBeenCalledTimes(2);
  });
});
