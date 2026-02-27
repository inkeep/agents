import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadExternalImage } from '../blob-storage/external-image-downloader';
import { normalizeInlineImageBytes } from '../blob-storage/image-content-security';
import { partsToMessageContentParts, uploadPartsImages } from '../blob-storage/image-upload';

const mockUpload = vi.fn();

vi.mock('../blob-storage/index', () => ({
  getBlobStorageProvider: () => ({
    upload: mockUpload,
  }),
  toBlobUri: (key: string) => `blob://${key}`,
}));

vi.mock('../blob-storage/external-image-downloader', () => ({
  downloadExternalImage: vi.fn(),
}));

vi.mock('../blob-storage/image-content-security', () => ({
  normalizeInlineImageBytes: vi.fn(),
}));

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+2wAAAABJRU5ErkJggg==',
  'base64'
);

const uploadContext = {
  tenantId: 'tenant',
  projectId: 'project',
  conversationId: 'conversation',
  messageId: 'message',
};

describe('uploadPartsImages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue(undefined);
    vi.mocked(downloadExternalImage).mockResolvedValue({
      data: Uint8Array.from(PNG_BYTES),
      mimeType: 'image/png',
    });
    vi.mocked(normalizeInlineImageBytes).mockResolvedValue({
      data: Uint8Array.from(PNG_BYTES),
      mimeType: 'image/png',
    });
  });

  it('delegates URI file parts to downloader and rewrites to blob URI', async () => {
    const parts = [{ kind: 'file', file: { uri: 'https://example.com/image.jpg' } }] as any[];
    const uploaded = await uploadPartsImages(parts, uploadContext);

    expect(downloadExternalImage).toHaveBeenCalledTimes(1);
    expect(downloadExternalImage).toHaveBeenCalledWith('https://example.com/image.jpg');
    expect(normalizeInlineImageBytes).not.toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalledTimes(1);
    const expectedKeyPrefix = 'v1/t_tenant/media/p_project/conv/c_conversation/m_message/sha256-';
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining(expectedKeyPrefix),
        contentType: 'image/png',
      })
    );
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatchObject({
      kind: 'file',
      file: {
        uri: expect.stringContaining(`blob://${expectedKeyPrefix}`),
        mimeType: 'image/png',
      },
    });
  });

  it('delegates inline byte file parts to normalizer and rewrites to blob URI', async () => {
    const parts = [
      { kind: 'file', file: { bytes: PNG_BYTES.toString('base64'), mimeType: 'image/jpeg' } },
    ] as any[];
    const uploaded = await uploadPartsImages(parts, uploadContext);

    expect(normalizeInlineImageBytes).toHaveBeenCalledTimes(1);
    expect(normalizeInlineImageBytes).toHaveBeenCalledWith({
      bytes: PNG_BYTES.toString('base64'),
      mimeType: 'image/jpeg',
    });
    expect(downloadExternalImage).not.toHaveBeenCalled();
    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatchObject({
      kind: 'file',
      file: {
        uri: expect.stringContaining(
          'blob://v1/t_tenant/media/p_project/conv/c_conversation/m_message/sha256-'
        ),
        mimeType: 'image/png',
      },
    });
  });

  it('preserves non-file parts and metadata while uploading files', async () => {
    const parts = [
      { kind: 'text', text: 'hello' },
      {
        kind: 'file',
        file: { uri: 'https://example.com/image.jpg' },
        metadata: { source: 'user-upload' },
      },
    ] as any[];

    const uploaded = await uploadPartsImages(parts, uploadContext);

    expect(uploaded).toHaveLength(2);
    expect(uploaded[0]).toEqual({ kind: 'text', text: 'hello' });
    expect(uploaded[1]).toMatchObject({
      kind: 'file',
      file: {
        uri: expect.stringContaining(
          'blob://v1/t_tenant/media/p_project/conv/c_conversation/m_message/sha256-'
        ),
        mimeType: 'image/png',
      },
      metadata: { source: 'user-upload' },
    });
  });

  it('drops URI file part when downloadExternalImage throws', async () => {
    vi.mocked(downloadExternalImage).mockRejectedValueOnce(new Error('blocked external image'));

    const parts = [{ kind: 'file', file: { uri: 'https://example.com/blocked.jpg' } }] as any[];
    const uploaded = await uploadPartsImages(parts, uploadContext);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(uploaded).toEqual([]);
  });

  it('drops inline byte file part when normalizeInlineImageBytes throws', async () => {
    vi.mocked(normalizeInlineImageBytes).mockRejectedValueOnce(new Error('blocked inline image'));

    const parts = [
      { kind: 'file', file: { bytes: PNG_BYTES.toString('base64'), mimeType: 'image/png' } },
    ] as any[];
    const uploaded = await uploadPartsImages(parts, uploadContext);

    expect(downloadExternalImage).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(uploaded).toEqual([]);
  });

  it('drops file part when storage.upload throws', async () => {
    mockUpload.mockRejectedValueOnce(new Error('storage quota exceeded'));
    const parts = [{ kind: 'file', file: { uri: 'https://example.com/image.jpg' } }] as any[];
    const uploaded = await uploadPartsImages(parts, uploadContext);
    expect(uploaded).toEqual([]);
  });

  it('skips upload when file part has neither uri nor bytes', async () => {
    const parts = [{ kind: 'file', file: {} }] as any[];
    const uploaded = await uploadPartsImages(parts, uploadContext);
    expect(uploaded).toEqual(parts);
  });
});

describe('partsToMessageContentParts', () => {
  it('converts text and uri-backed file parts', () => {
    const result = partsToMessageContentParts([
      { kind: 'text', text: 'hello' } as any,
      {
        kind: 'file',
        file: { uri: 'blob://foo/bar.png', mimeType: 'image/png' },
        metadata: { source: 'upload' },
      } as any,
    ]);

    expect(result).toEqual([
      { kind: 'text', text: 'hello' },
      {
        kind: 'file',
        data: 'blob://foo/bar.png',
        metadata: { mimeType: 'image/png', source: 'upload' },
      },
    ]);
  });

  it('drops file parts without uri', () => {
    const result = partsToMessageContentParts([{ kind: 'file', file: { bytes: 'abc' } } as any]);
    expect(result).toEqual([]);
  });
});
