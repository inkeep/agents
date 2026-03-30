import type { FilePart, TextPart } from '@inkeep/agents-core';
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
  buildPersistedMessageContent,
  inlineExternalPdfUrlParts,
} from '../blob-storage/file-upload-helpers';

vi.mock('../blob-storage/file-upload', () => ({
  hasFileParts: vi.fn(),
  uploadPartsFiles: vi.fn(),
  makeMessageContentParts: vi.fn(),
}));

vi.mock('../blob-storage/external-file-downloader', () => ({
  downloadExternalFile: vi.fn(),
}));

const ctx = {
  tenantId: 'tenant',
  projectId: 'project',
  conversationId: 'conversation',
  messageId: 'message',
};

describe('buildPersistedMessageContent', () => {
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
