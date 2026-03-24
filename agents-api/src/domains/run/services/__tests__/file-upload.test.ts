import type { FilePart, Part, TextPart } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadExternalFile } from '../blob-storage/external-file-downloader';
import { normalizeInlineFileBytes } from '../blob-storage/file-content-security';
import { makeMessageContentParts, uploadPartsFiles } from '../blob-storage/file-upload';

const logger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockUpload = vi.fn();

vi.mock('../../../../logger', () => ({
  getLogger: () => logger,
}));

vi.mock('../blob-storage/index', () => ({
  getBlobStorageProvider: () => ({
    upload: mockUpload,
  }),
  toBlobUri: (key: string) => `blob://${key}`,
}));

vi.mock('../blob-storage/external-file-downloader', () => ({
  downloadExternalFile: vi.fn(),
}));

vi.mock('../blob-storage/file-content-security', () => ({
  normalizeInlineFileBytes: vi.fn(),
}));

const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+2wAAAABJRU5ErkJggg==',
  'base64'
);
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n', 'utf8');

const uploadContext = {
  tenantId: 'tenant',
  projectId: 'project',
  conversationId: 'conversation',
  messageId: 'message',
};

describe('uploadPartsFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue(undefined);
    vi.mocked(downloadExternalFile).mockResolvedValue({
      data: Uint8Array.from(PNG_BYTES),
      mimeType: 'image/png',
    });
    vi.mocked(normalizeInlineFileBytes).mockResolvedValue({
      data: Uint8Array.from(PNG_BYTES),
      mimeType: 'image/png',
    });
  });

  it('delegates URI file parts to downloader and rewrites to blob URI', async () => {
    const parts: Part[] = [{ kind: 'file', file: { uri: 'https://example.com/image.jpg' } }];
    const uploaded = await uploadPartsFiles(parts, uploadContext);

    expect(downloadExternalFile).toHaveBeenCalledTimes(1);
    expect(downloadExternalFile).toHaveBeenCalledWith('https://example.com/image.jpg');
    expect(normalizeInlineFileBytes).not.toHaveBeenCalled();
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
    const parts: Part[] = [
      { kind: 'file', file: { bytes: PNG_BYTES.toString('base64'), mimeType: 'image/jpeg' } },
    ];
    const uploaded = await uploadPartsFiles(parts, uploadContext);

    expect(normalizeInlineFileBytes).toHaveBeenCalledTimes(1);
    expect(normalizeInlineFileBytes).toHaveBeenCalledWith({
      bytes: PNG_BYTES.toString('base64'),
      mimeType: 'image/jpeg',
    });
    expect(downloadExternalFile).not.toHaveBeenCalled();
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

  it('uploads inline PDF file parts and rewrites to blob URI', async () => {
    vi.mocked(normalizeInlineFileBytes).mockResolvedValueOnce({
      data: Uint8Array.from(PDF_BYTES),
      mimeType: 'application/pdf',
    });
    const parts: Part[] = [
      { kind: 'file', file: { bytes: PDF_BYTES.toString('base64'), mimeType: 'application/pdf' } },
    ];

    const uploaded = await uploadPartsFiles(parts, uploadContext);

    expect(normalizeInlineFileBytes).toHaveBeenCalledWith({
      bytes: PDF_BYTES.toString('base64'),
      mimeType: 'application/pdf',
    });
    expect(mockUpload).toHaveBeenCalledWith(
      expect.objectContaining({
        key: expect.stringContaining(
          'v1/t_tenant/media/p_project/conv/c_conversation/m_message/sha256-'
        ),
        contentType: 'application/pdf',
      })
    );
    expect(uploaded[0]).toMatchObject({
      kind: 'file',
      file: {
        uri: expect.stringContaining('blob://v1/t_tenant/media/p_project/conv/c_conversation'),
        mimeType: 'application/pdf',
      },
    });
  });

  it('preserves non-file parts and metadata while uploading files', async () => {
    const textPart: TextPart = { kind: 'text', text: 'hello' };
    const filePart: FilePart = {
      kind: 'file',
      file: { uri: 'https://example.com/image.jpg' },
      metadata: { source: 'user-upload' },
    };
    const parts: Part[] = [textPart, filePart];

    const uploaded = await uploadPartsFiles(parts, uploadContext);

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

  it('drops URI file part when downloadExternalFile throws', async () => {
    vi.mocked(downloadExternalFile).mockRejectedValueOnce(new Error('blocked external file'));

    const parts: Part[] = [{ kind: 'file', file: { uri: 'https://example.com/blocked.jpg' } }];
    const uploaded = await uploadPartsFiles(parts, uploadContext);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(uploaded).toEqual([]);
  });

  it('drops external PDF URLs and logs correlation context', async () => {
    const parts: Part[] = [
      {
        kind: 'file',
        file: {
          uri: 'https://example.com/report.pdf',
          mimeType: 'application/pdf',
        },
      },
    ];

    const uploaded = await uploadPartsFiles(parts, uploadContext);

    expect(uploaded).toEqual([]);
    expect(downloadExternalFile).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 0,
        tenantId: uploadContext.tenantId,
        projectId: uploadContext.projectId,
        conversationId: uploadContext.conversationId,
        messageId: uploadContext.messageId,
        file: expect.objectContaining({
          uri: 'https://example.com/report.pdf',
          mimeType: 'application/pdf',
        }),
      }),
      'Failed to upload file part, dropping from persisted message to avoid storing base64 in DB'
    );
  });

  it('drops inline byte file part when normalizeInlineFileBytes throws', async () => {
    vi.mocked(normalizeInlineFileBytes).mockRejectedValueOnce(new Error('blocked inline file'));

    const parts: Part[] = [
      { kind: 'file', file: { bytes: PNG_BYTES.toString('base64'), mimeType: 'image/png' } },
    ];
    const uploaded = await uploadPartsFiles(parts, uploadContext);

    expect(downloadExternalFile).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(uploaded).toEqual([]);
  });

  it('drops file part when storage.upload throws', async () => {
    mockUpload.mockRejectedValueOnce(new Error('storage quota exceeded'));
    const parts: Part[] = [{ kind: 'file', file: { uri: 'https://example.com/image.jpg' } }];
    const uploaded = await uploadPartsFiles(parts, uploadContext);
    expect(uploaded).toEqual([]);
  });

  it('skips upload when file part has neither uri nor bytes', async () => {
    const part = { kind: 'file' as const, file: {} } as FilePart;
    const parts: Part[] = [part];
    const uploaded = await uploadPartsFiles(parts, uploadContext);
    expect(uploaded).toEqual(parts);
  });
});

describe('makeMessageContentParts', () => {
  it('converts text and uri-backed file parts', () => {
    const textPart: TextPart = { kind: 'text', text: 'hello' };
    const filePart: FilePart = {
      kind: 'file',
      file: { uri: 'blob://foo/bar.png', mimeType: 'image/png' },
      metadata: { source: 'upload' },
    };

    const result = makeMessageContentParts([textPart, filePart]);

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
    const part: FilePart = { kind: 'file', file: { bytes: 'abc' } };
    const result = makeMessageContentParts([part]);
    expect(result).toEqual([]);
  });
});
