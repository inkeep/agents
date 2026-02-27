import { describe, expect, it, vi } from 'vitest';
import { buildPersistedMessageContent } from '../blob-storage/image-upload-helpers';
import {
  hasFileParts,
  partsToMessageContentParts,
  uploadPartsImages,
} from '../blob-storage/image-upload';

vi.mock('../blob-storage/image-upload', () => ({
  hasFileParts: vi.fn(),
  uploadPartsImages: vi.fn(),
  partsToMessageContentParts: vi.fn(),
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
    const result = await buildPersistedMessageContent('hello', [{ kind: 'text', text: 'hello' } as any], ctx);
    expect(result).toEqual({ text: 'hello' });
    expect(uploadPartsImages).not.toHaveBeenCalled();
  });

  it('returns text plus transformed parts when upload succeeds', async () => {
    vi.mocked(hasFileParts).mockReturnValueOnce(true);
    vi.mocked(uploadPartsImages).mockResolvedValueOnce([{ kind: 'file', file: { uri: 'blob://a' } } as any]);
    vi.mocked(partsToMessageContentParts).mockReturnValueOnce([
      { kind: 'file', data: 'blob://a', metadata: {} },
    ]);

    const result = await buildPersistedMessageContent('hello', [{ kind: 'file' } as any], ctx);
    expect(result).toEqual({
      text: 'hello',
      parts: [{ kind: 'file', data: 'blob://a', metadata: {} }],
    });
  });

  it('falls back to text-only when upload throws', async () => {
    vi.mocked(hasFileParts).mockReturnValueOnce(true);
    vi.mocked(uploadPartsImages).mockRejectedValueOnce(new Error('upload failed'));

    const result = await buildPersistedMessageContent('hello', [{ kind: 'file' } as any], ctx);
    expect(result).toEqual({ text: 'hello' });
  });
});
