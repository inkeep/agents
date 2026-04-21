import type { FilePart } from '@inkeep/agents-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnsupportedTextAttachmentSourceError } from '../blob-storage/file-security-errors';
import { getBlobStorageProvider } from '../blob-storage/index';
import { resolveTextAttachmentBlock } from '../blob-storage/text-attachment-resolver';

vi.mock('../blob-storage/index', async () => {
  const actual =
    await vi.importActual<typeof import('../blob-storage/index')>('../blob-storage/index');
  return { ...actual, getBlobStorageProvider: vi.fn() };
});

describe('resolveTextAttachmentBlock', () => {
  const mockDownload = vi.fn();

  beforeEach(() => {
    mockDownload.mockReset();
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: vi.fn(),
      delete: vi.fn(),
      download: mockDownload,
    } as any);
  });

  it('decodes inline bytes and wraps them in an attached_file block', async () => {
    const part: FilePart = {
      kind: 'file',
      file: {
        bytes: Buffer.from('hello from bytes', 'utf8').toString('base64'),
        mimeType: 'text/plain',
      },
      metadata: { filename: 'inline.txt' },
    };
    await expect(resolveTextAttachmentBlock(part)).resolves.toBe(
      '<attached_file filename="inline.txt" media_type="text/plain">\nhello from bytes\n</attached_file>'
    );
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('downloads blob-backed parts and wraps the decoded content', async () => {
    mockDownload.mockResolvedValueOnce({
      data: new TextEncoder().encode('hello from blob'),
      contentType: 'text/plain',
    });
    const part: FilePart = {
      kind: 'file',
      file: { uri: 'blob://abc', mimeType: 'text/plain' },
      metadata: { filename: 'blob.txt' },
    };
    await expect(resolveTextAttachmentBlock(part)).resolves.toBe(
      '<attached_file filename="blob.txt" media_type="text/plain">\nhello from blob\n</attached_file>'
    );
    expect(mockDownload).toHaveBeenCalledWith('abc');
  });

  it('returns [Attachment unavailable] when blob download fails', async () => {
    mockDownload.mockRejectedValueOnce(new Error('404'));
    const part: FilePart = {
      kind: 'file',
      file: { uri: 'blob://gone', mimeType: 'text/plain' },
      metadata: { filename: 'gone.txt' },
    };
    await expect(resolveTextAttachmentBlock(part)).resolves.toBe(
      '<attached_file filename="gone.txt" media_type="text/plain">\n[Attachment unavailable]\n</attached_file>'
    );
  });

  it('returns [Attachment unavailable] when decoding fails on invalid UTF-8', async () => {
    mockDownload.mockResolvedValueOnce({
      data: new Uint8Array([0xff, 0xfe, 0xfd]),
      contentType: 'text/plain',
    });
    const part: FilePart = {
      kind: 'file',
      file: { uri: 'blob://bad-bytes', mimeType: 'text/plain' },
      metadata: { filename: 'bad.txt' },
    };
    await expect(resolveTextAttachmentBlock(part)).resolves.toContain('[Attachment unavailable]');
  });

  it('returns [Attachment unavailable] by default when source is unresolvable', async () => {
    const part: FilePart = {
      kind: 'file',
      file: { uri: 'https://external.example.com/x.txt', mimeType: 'text/plain' },
      metadata: { filename: 'remote.txt' },
    };
    await expect(resolveTextAttachmentBlock(part)).resolves.toContain('[Attachment unavailable]');
  });

  it('throws UnsupportedTextAttachmentSourceError when throwIfUnresolvable=true and source is unresolvable', async () => {
    const part: FilePart = {
      kind: 'file',
      file: { uri: 'https://external.example.com/x.txt', mimeType: 'text/plain' },
      metadata: { filename: 'remote.txt' },
    };
    await expect(
      resolveTextAttachmentBlock(part, { throwIfUnresolvable: true })
    ).rejects.toBeInstanceOf(UnsupportedTextAttachmentSourceError);
  });
});
