import type { Part } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn().mockImplementation((...args: any[]) => {
    const options = args[args.length - 1];
    if (options && typeof options === 'object' && 'all' in options && options.all) {
      return Promise.resolve([{ address: '93.184.216.34', family: 4 }]);
    }
    return Promise.resolve({ address: '93.184.216.34', family: 4 });
  }),
}));

vi.mock('../../../../env', () => ({
  env: {
    BLOB_STORAGE_PROVIDER: 's3',
    BLOB_STORAGE_S3_ENDPOINT: 'http://localhost:9000',
    BLOB_STORAGE_S3_BUCKET: 'test-bucket',
    BLOB_STORAGE_S3_REGION: 'us-east-1',
    BLOB_STORAGE_S3_ACCESS_KEY_ID: 'test-key',
    BLOB_STORAGE_S3_SECRET_ACCESS_KEY: 'test-secret',
    BLOB_STORAGE_S3_FORCE_PATH_STYLE: true,
    INKEEP_AGENTS_API_URL: 'http://localhost:3002',
  },
}));

const mockUpload = vi.fn().mockResolvedValue(undefined);
const mockDownload = vi.fn().mockResolvedValue({
  data: new Uint8Array([1, 2, 3]),
  contentType: 'image/png',
});
const mockDelete = vi.fn().mockResolvedValue(undefined);
const mockGetPresignedUrl = vi.fn().mockResolvedValue('https://presigned.url/test');
const VALID_PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+2wAAAABJRU5ErkJggg==',
  'base64'
);

vi.mock('../blob-storage', () => ({
  getBlobStorageProvider: () => ({
    upload: mockUpload,
    download: mockDownload,
    delete: mockDelete,
    getPresignedUrl: mockGetPresignedUrl,
  }),
  BLOB_URI_PREFIX: 'blob://',
  isBlobUri: (uri: string) => uri.startsWith('blob://'),
  toBlobUri: (key: string) => `blob://${key}`,
  fromBlobUri: (uri: string) => uri.slice('blob://'.length),
}));

describe('Image Upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadPartsImages', () => {
    it('should upload base64 image parts to blob storage', async () => {
      const { uploadPartsImages } = await import('../blob-storage/image-upload');

      const parts: Part[] = [
        { kind: 'text', text: 'Hello' },
        {
          kind: 'file',
          file: {
            bytes: VALID_PNG_BYTES.toString('base64'),
            mimeType: 'image/png',
          },
        },
      ];

      const ctx = {
        tenantId: 'tenant-1',
        projectId: 'project-1',
        conversationId: 'conv-1',
        messageId: 'msg-1',
      };

      const result = await uploadPartsImages(parts, ctx);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ kind: 'text', text: 'Hello' });
      expect(result[1].kind).toBe('file');

      const filePart = result[1] as any;
      expect(filePart.file.uri).toMatch(/^blob:\/\//);
      expect(filePart.file.mimeType).toBe('image/png');
      expect(mockUpload).toHaveBeenCalledOnce();
      expect(mockUpload).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'image/png',
          key: expect.stringContaining('tenant-1/project-1/conv-1/msg-1/'),
        })
      );
    });

    it('should download and re-upload HTTP URL images', async () => {
      const { uploadPartsImages } = await import('../blob-storage/image-upload');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        new Response(VALID_PNG_BYTES, {
          status: 200,
          headers: { 'content-type': 'image/png' },
        })
      );

      const parts: Part[] = [
        {
          kind: 'file',
          file: {
            uri: 'https://example.com/image.png',
            mimeType: 'image/png',
          },
        },
      ];

      const ctx = {
        tenantId: 'tenant-1',
        projectId: 'project-1',
        conversationId: 'conv-1',
        messageId: 'msg-2',
      };

      const result = await uploadPartsImages(parts, ctx);

      expect(result).toHaveLength(1);
      expect(result[0].kind).toBe('file');
      const filePart = result[0] as any;
      expect(filePart.file.uri).toMatch(/^blob:\/\//);
      expect(filePart.file.mimeType).toBe('image/png');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://example.com/image.png',
        expect.objectContaining({ redirect: 'manual' })
      );
      expect(mockUpload).toHaveBeenCalledOnce();

      fetchSpy.mockRestore();
    });

    it('should pass through text parts unchanged', async () => {
      const { uploadPartsImages } = await import('../blob-storage/image-upload');

      const parts: Part[] = [
        { kind: 'text', text: 'Just text' },
        { kind: 'text', text: 'More text' },
      ];

      const ctx = {
        tenantId: 'tenant-1',
        projectId: 'project-1',
        conversationId: 'conv-1',
        messageId: 'msg-3',
      };

      const result = await uploadPartsImages(parts, ctx);

      expect(result).toEqual(parts);
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('should drop file parts on upload failure to avoid persisting base64', async () => {
      const { uploadPartsImages } = await import('../blob-storage/image-upload');

      mockUpload.mockRejectedValueOnce(new Error('S3 error'));

      const parts: Part[] = [
        { kind: 'text', text: 'Hello' },
        {
          kind: 'file',
          file: {
            bytes: VALID_PNG_BYTES.toString('base64'),
            mimeType: 'image/png',
          },
        },
      ];

      const ctx = {
        tenantId: 'tenant-1',
        projectId: 'project-1',
        conversationId: 'conv-1',
        messageId: 'msg-4',
      };

      const result = await uploadPartsImages(parts, ctx);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ kind: 'text', text: 'Hello' });
    });
  });

  describe('hasFileParts', () => {
    it('should return true when file parts exist', async () => {
      const { hasFileParts } = await import('../blob-storage/image-upload');

      const parts: Part[] = [
        { kind: 'text', text: 'Hello' },
        { kind: 'file', file: { bytes: 'abc', mimeType: 'image/png' } },
      ];

      expect(hasFileParts(parts)).toBe(true);
    });

    it('should return false when no file parts exist', async () => {
      const { hasFileParts } = await import('../blob-storage/image-upload');

      const parts: Part[] = [
        { kind: 'text', text: 'Hello' },
        { kind: 'text', text: 'World' },
      ];

      expect(hasFileParts(parts)).toBe(false);
    });
  });

  describe('partsToMessageContentParts', () => {
    it('should convert text parts correctly', async () => {
      const { partsToMessageContentParts } = await import('../blob-storage/image-upload');

      const parts: Part[] = [{ kind: 'text', text: 'Hello world' }];
      const result = partsToMessageContentParts(parts);

      expect(result).toEqual([{ kind: 'text', text: 'Hello world' }]);
    });

    it('should convert file parts with blob URIs correctly', async () => {
      const { partsToMessageContentParts } = await import('../blob-storage/image-upload');

      const parts: Part[] = [
        {
          kind: 'file',
          file: { uri: 'blob://tenant/project/conv/msg/hash.png', mimeType: 'image/png' },
        },
      ];

      const result = partsToMessageContentParts(parts);

      expect(result).toEqual([
        {
          kind: 'file',
          data: 'blob://tenant/project/conv/msg/hash.png',
          metadata: { mimeType: 'image/png' },
        },
      ]);
    });
  });
});

describe('Blob URI helpers', () => {
  describe('isBlobUri / toBlobUri / fromBlobUri', () => {
    it('should correctly identify blob URIs', async () => {
      const { isBlobUri } = await import('../blob-storage');

      expect(isBlobUri('blob://some/key')).toBe(true);
      expect(isBlobUri('https://example.com')).toBe(false);
      expect(isBlobUri('data:image/png;base64,abc')).toBe(false);
    });

    it('should convert to and from blob URIs', async () => {
      const { toBlobUri, fromBlobUri } = await import('../blob-storage/index');

      const key = 'tenant/project/conv/msg/hash.png';
      const uri = toBlobUri(key);
      expect(uri).toBe('blob://tenant/project/conv/msg/hash.png');
      expect(fromBlobUri(uri)).toBe(key);
    });
  });
});

describe('Resolve blob URIs', () => {
  it('should resolve blob URIs in message content to proxy URLs', async () => {
    const { resolveMessageBlobUris } = await import('../blob-storage/resolve-blob-uris');

    const content = {
      text: 'Hello',
      parts: [
        { kind: 'text', text: 'Hello' },
        {
          kind: 'file',
          data: 'blob://tenant/project/conv/msg/hash.png',
          metadata: { mimeType: 'image/png' },
        },
      ],
    };

    const resolved = resolveMessageBlobUris(content);

    expect(resolved.text).toBe('Hello');
    expect(resolved.parts).toHaveLength(2);
    expect(resolved.parts?.[0]).toEqual({ kind: 'text', text: 'Hello' });
    expect(resolved.parts?.[1].data).toBe(
      'http://localhost:3002/manage/tenants/tenant/projects/project/conversations/conv/media/msg%2Fhash.png'
    );
  });

  it('should not modify content without parts', async () => {
    const { resolveMessageBlobUris } = await import('../blob-storage/resolve-blob-uris');

    const content = { text: 'Hello' };
    const resolved = resolveMessageBlobUris(content);

    expect(resolved).toEqual(content);
  });

  it('should not modify non-blob URIs', async () => {
    const { resolveMessageBlobUris } = await import('../blob-storage/resolve-blob-uris');

    const content = {
      text: 'Hello',
      parts: [
        {
          kind: 'file',
          data: 'https://example.com/image.png',
          metadata: { mimeType: 'image/png' },
        },
      ],
    };

    const resolved = resolveMessageBlobUris(content);

    expect(resolved.parts?.[0].data).toBe('https://example.com/image.png');
  });

  it('should resolve multiple messages', async () => {
    const { resolveMessagesListBlobUris } = await import('../blob-storage/resolve-blob-uris');

    const messages = [
      {
        id: 'msg-1',
        content: {
          text: 'Hello',
          parts: [
            {
              kind: 'file',
              data: 'blob://t/p/c/m/1.png',
              metadata: { mimeType: 'image/png' },
            },
          ],
        },
      },
      {
        id: 'msg-2',
        content: { text: 'No images here' },
      },
    ];

    const resolved = resolveMessagesListBlobUris(messages);

    expect(resolved[0].content.parts?.[0].data).toContain('/media/');
    expect(resolved[1].content.text).toBe('No images here');
  });
});

describe('buildPersistedMessageContent', () => {
  it('should return text-only content when no file parts', async () => {
    const { buildPersistedMessageContent } = await import('../blob-storage/image-upload-helpers');

    const parts: Part[] = [{ kind: 'text', text: 'Hello' }];
    const ctx = {
      tenantId: 't',
      projectId: 'p',
      conversationId: 'c',
      messageId: 'm',
    };

    const result = await buildPersistedMessageContent('Hello', parts, ctx);

    expect(result).toEqual({ text: 'Hello' });
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('should upload images and include parts when file parts exist', async () => {
    const { buildPersistedMessageContent } = await import('../blob-storage/image-upload-helpers');

    const parts: Part[] = [
      { kind: 'text', text: 'Look at this' },
      {
        kind: 'file',
        file: {
          bytes: VALID_PNG_BYTES.toString('base64'),
          mimeType: 'image/png',
        },
      },
    ];

    const ctx = {
      tenantId: 'tenant-1',
      projectId: 'project-1',
      conversationId: 'conv-1',
      messageId: 'msg-1',
    };

    const result = await buildPersistedMessageContent('Look at this', parts, ctx);

    expect(result.text).toBe('Look at this');
    expect(result.parts).toBeDefined();
    expect(result.parts?.length).toBe(2);
    expect(result.parts?.[0].kind).toBe('text');
    expect(result.parts?.[1].kind).toBe('file');
    expect(mockUpload).toHaveBeenCalledOnce();
  });
});
