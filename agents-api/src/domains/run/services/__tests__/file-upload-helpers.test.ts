import type { FilePart, TextPart } from '@inkeep/agents-core';
import { describe, expect, it, vi } from 'vitest';
import {
  hasFileParts,
  makeMessageContentParts,
  uploadPartsFiles,
} from '../blob-storage/file-upload';
import { buildPersistedMessageContent } from '../blob-storage/file-upload-helpers';

vi.mock('../blob-storage/file-upload', () => ({
  hasFileParts: vi.fn(),
  uploadPartsFiles: vi.fn(),
  makeMessageContentParts: vi.fn(),
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
});
