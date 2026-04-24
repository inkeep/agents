import type { FilePart, Part, TextPart } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadExternalFile } from '../blob-storage/external-file-downloader';
import {
  BlockedInlineFileExceedingError,
  PdfUrlIngestionError,
} from '../blob-storage/file-security-errors';
import {
  hasFileParts,
  makeMessageContentParts,
  uploadPartsFiles,
} from '../blob-storage/file-upload';
import {
  attachArtifactRefsToFileParts,
  buildPersistedMessageContent,
  expandTextFilePartsWithDecodedText,
  inlineExternalPdfUrlParts,
} from '../blob-storage/file-upload-helpers';
import { getBlobStorageProvider } from '../blob-storage/index';

vi.mock('../blob-storage/attachment-artifacts', () => ({
  createAttachmentArtifacts: vi.fn().mockResolvedValue([]),
}));

vi.mock('../blob-storage/file-upload', () => ({
  hasFileParts: vi.fn(),
  uploadPartsFiles: vi.fn(),
  makeMessageContentParts: vi.fn(),
}));

vi.mock('../blob-storage/external-file-downloader', () => ({
  downloadExternalFile: vi.fn(),
}));

vi.mock('../blob-storage/index', async () => {
  const actual =
    await vi.importActual<typeof import('../blob-storage/index')>('../blob-storage/index');
  return {
    ...actual,
    getBlobStorageProvider: vi.fn(),
  };
});

const ctx = {
  tenantId: 'tenant',
  projectId: 'project',
  conversationId: 'conversation',
  messageId: 'message',
  taskId: 'message_message',
  toolCallId: 'message_attachment:message',
  source: 'user-message' as const,
};

describe('buildPersistedMessageContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns text-only content when there are no file parts', async () => {
    vi.mocked(hasFileParts).mockReturnValueOnce(false);
    const textPart: TextPart = { kind: 'text', text: 'hello' };
    const result = await buildPersistedMessageContent('hello', [textPart], ctx);
    expect(result).toEqual({ text: 'hello' });
    expect(uploadPartsFiles).not.toHaveBeenCalled();
  });

  it('returns text plus transformed parts when upload succeeds', async () => {
    vi.mocked(hasFileParts).mockReturnValueOnce(true);
    const uploadedFilePart: FilePart = {
      kind: 'file',
      file: { uri: 'blob://a', mimeType: 'image/png' },
    };
    vi.mocked(uploadPartsFiles).mockResolvedValueOnce([uploadedFilePart]);
    vi.mocked(makeMessageContentParts).mockReturnValueOnce([
      { kind: 'file', data: 'blob://a', metadata: {} },
    ]);
    const inputFilePart: FilePart = { kind: 'file', file: { uri: 'https://example.com/img.png' } };
    const result = await buildPersistedMessageContent('hello', [inputFilePart], ctx);
    expect(result).toEqual({
      text: 'hello',
      parts: [{ kind: 'file', data: 'blob://a', metadata: {} }],
    });
  });

  it('falls back to text-only when upload throws', async () => {
    vi.mocked(hasFileParts).mockReturnValueOnce(true);
    vi.mocked(uploadPartsFiles).mockRejectedValueOnce(new Error('upload failed'));

    const inputFilePart: FilePart = { kind: 'file', file: { uri: 'https://example.com/img.png' } };
    const result = await buildPersistedMessageContent('hello', [inputFilePart], ctx);
    expect(result).toEqual({ text: 'hello' });
  });

  it('rethrows file validation errors from uploadPartsFiles', async () => {
    vi.mocked(hasFileParts).mockReturnValueOnce(true);
    vi.mocked(uploadPartsFiles).mockRejectedValueOnce(
      new BlockedInlineFileExceedingError(256 * 1024)
    );

    const inputFilePart: FilePart = { kind: 'file', file: { uri: 'https://example.com/img.png' } };

    await expect(
      buildPersistedMessageContent('hello', [inputFilePart], ctx)
    ).rejects.toBeInstanceOf(BlockedInlineFileExceedingError);
  });
});

describe('expandTextFilePartsWithDecodedText', () => {
  const mockDownload = vi.fn();

  beforeEach(() => {
    mockDownload.mockReset();
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: vi.fn(),
      delete: vi.fn(),
      download: mockDownload,
    } as any);
  });

  it('leaves non-text file parts unchanged', async () => {
    const imagePart: FilePart = {
      kind: 'file',
      file: { uri: 'blob://img', mimeType: 'image/png' },
    };
    const result = await expandTextFilePartsWithDecodedText([imagePart]);
    expect(result).toEqual([imagePart]);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('injects a decoded text part before text-mime file parts', async () => {
    mockDownload.mockResolvedValueOnce({
      data: new TextEncoder().encode('hello world'),
      contentType: 'text/plain',
    });
    const textFilePart: FilePart = {
      kind: 'file',
      file: { uri: 'blob://notes', mimeType: 'text/plain' },
      metadata: { filename: 'notes.txt' },
    };
    const result = (await expandTextFilePartsWithDecodedText([textFilePart])) as Part[];
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      kind: 'text',
      text: '<attached_file filename="notes.txt" media_type="text/plain">\nhello world\n</attached_file>',
    });
    expect(result[1]).toEqual(textFilePart);
  });

  it('falls back to an [Attachment unavailable] text part when blob download fails', async () => {
    mockDownload.mockRejectedValueOnce(new Error('blob 404'));
    const textFilePart: FilePart = {
      kind: 'file',
      file: { uri: 'blob://missing', mimeType: 'text/plain' },
      metadata: { filename: 'lost.txt' },
    };
    const result = (await expandTextFilePartsWithDecodedText([textFilePart])) as Part[];
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      kind: 'text',
      text: '<attached_file filename="lost.txt" media_type="text/plain">\n[Attachment unavailable]\n</attached_file>',
    });
    expect(result[1]).toEqual(textFilePart);
  });

  it('falls back when decoding fails (non-UTF-8 bytes)', async () => {
    mockDownload.mockResolvedValueOnce({
      data: new Uint8Array([0xff, 0xfe, 0xfd]),
      contentType: 'text/plain',
    });
    const textFilePart: FilePart = {
      kind: 'file',
      file: { uri: 'blob://bad', mimeType: 'text/plain' },
      metadata: { filename: 'bad.txt' },
    };
    const result = (await expandTextFilePartsWithDecodedText([textFilePart])) as Part[];
    expect(result).toHaveLength(2);
    expect((result[0] as TextPart).text).toContain('[Attachment unavailable]');
  });

  it('passes through non-file parts (text, data) untouched', async () => {
    const textPart: TextPart = { kind: 'text', text: 'user typed this' };
    const dataPart: Part = {
      kind: 'data',
      data: { artifactId: 'a', toolCallId: 't' },
    } as Part;
    const result = await expandTextFilePartsWithDecodedText([textPart, dataPart]);
    expect(result).toEqual([textPart, dataPart]);
    expect(mockDownload).not.toHaveBeenCalled();
  });
});

describe('attachArtifactRefsToFileParts', () => {
  it('stamps matching file parts with artifactId and toolCallId from refs', () => {
    const imagePart: FilePart = {
      kind: 'file',
      file: { uri: 'blob://img', mimeType: 'image/png' },
      metadata: { filename: 'a.png' },
    };
    const result = attachArtifactRefsToFileParts(
      [imagePart],
      [{ artifactId: 'art-1', toolCallId: 'tool-1', blobUri: 'blob://img' }]
    );
    expect(result[0]).toEqual({
      ...imagePart,
      metadata: { filename: 'a.png', artifactId: 'art-1', toolCallId: 'tool-1' },
    });
  });

  it('leaves parts untouched when no ref matches their blob URI', () => {
    const imagePart: FilePart = {
      kind: 'file',
      file: { uri: 'blob://img', mimeType: 'image/png' },
    };
    const result = attachArtifactRefsToFileParts(
      [imagePart],
      [{ artifactId: 'art-other', toolCallId: 'tool', blobUri: 'blob://other' }]
    );
    expect(result).toEqual([imagePart]);
  });

  it('returns the same parts array reference when refs is empty (fast path)', () => {
    const imagePart: FilePart = {
      kind: 'file',
      file: { uri: 'blob://img', mimeType: 'image/png' },
    };
    const parts: Part[] = [imagePart];
    expect(attachArtifactRefsToFileParts(parts, [])).toBe(parts);
  });

  it('passes non-file parts through unchanged', () => {
    const textPart: TextPart = { kind: 'text', text: 'hi' };
    const result = attachArtifactRefsToFileParts(
      [textPart],
      [{ artifactId: 'art-1', toolCallId: 'tool-1', blobUri: 'blob://img' }]
    );
    expect(result).toEqual([textPart]);
  });
});

describe('inlineExternalPdfUrlParts', () => {
  beforeEach(() => {
    vi.mocked(downloadExternalFile).mockReset();
  });

  it('inlines external PDF URLs into base64 bytes and stores sanitized source URL metadata', async () => {
    vi.mocked(downloadExternalFile).mockResolvedValueOnce({
      data: Uint8Array.from(Buffer.from('%PDF-1.7\nstub\n', 'utf8')),
      mimeType: 'application/pdf',
    });

    const result = await inlineExternalPdfUrlParts([
      {
        kind: 'file',
        file: {
          uri: 'https://example.com/report.pdf?token=secret#fragment',
          mimeType: 'application/pdf',
        },
      },
    ]);

    expect(result).toMatchObject([
      {
        kind: 'file',
        file: {
          mimeType: 'application/pdf',
        },
        metadata: {
          sourceUrl: 'https://example.com/report.pdf',
        },
      },
    ]);
    expect((result[0] as FilePart).file).toHaveProperty('bytes');
  });

  it('throws PdfUrlIngestionError when PDF URL download/validation fails', async () => {
    vi.mocked(downloadExternalFile).mockRejectedValueOnce(new Error('blocked'));

    await expect(
      inlineExternalPdfUrlParts([
        {
          kind: 'file',
          file: {
            uri: 'https://example.com/bad.pdf?token=secret',
            mimeType: 'application/pdf',
          },
        },
      ])
    ).rejects.toBeInstanceOf(PdfUrlIngestionError);
  });

  it('does not download when the PDF uri is a data URI', async () => {
    const dataPart: FilePart = {
      kind: 'file',
      file: {
        uri: 'data:application/pdf;base64,JVBERi0xLjQK',
        mimeType: 'application/pdf',
      },
    };

    const result = await inlineExternalPdfUrlParts([dataPart]);

    expect(result).toEqual([dataPart]);
    expect(downloadExternalFile).not.toHaveBeenCalled();
  });
});
