import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  sanitizeArtifactBinaryData,
  stripBinaryDataForObservability,
} from '../blob-storage/artifact-binary-sanitizer';

vi.mock('../blob-storage/index', () => ({
  getBlobStorageProvider: vi.fn(),
  isBlobUri: (s: string) => s.startsWith('blob://'),
  toBlobUri: (key: string) => `blob://${key}`,
  fromBlobUri: (uri: string) => uri.slice('blob://'.length),
  BLOB_URI_PREFIX: 'blob://',
}));

vi.mock('../blob-storage/storage-keys', () => ({
  buildStorageKey: vi.fn(
    (input: any) =>
      `v1/t_${input.tenantId}/artifact-data/p_${input.projectId}/a_${input.artifactId}/sha256-${input.contentHash}.${input.ext}`
  ),
}));

const SMALL_BASE64 = 'aGVsbG8='; // "hello" — only 8 chars, below threshold
const LARGE_BASE64 = Buffer.from('x'.repeat(200)).toString('base64'); // > 100 chars

const CTX = { tenantId: 'tenant-1', projectId: 'proj-1', artifactId: 'art-1' };

describe('stripBinaryDataForObservability', () => {
  it('replaces image part data with placeholder', () => {
    const input = { type: 'image', data: LARGE_BASE64, mimeType: 'image/png' };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.type).toBe('image');
    expect(result.data).toMatch(/^\[binary data ~\d+ bytes, mimeType: image\/png\]$/);
    expect(result.mimeType).toBe('image/png');
  });

  it('replaces file part data with placeholder', () => {
    const input = { type: 'file', data: LARGE_BASE64, mimeType: 'application/pdf' };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.data).toMatch(/^\[binary data ~\d+ bytes/);
  });

  it('leaves already-blob-uri data untouched', () => {
    const input = { type: 'image', data: 'blob://some/key', mimeType: 'image/png' };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.data).toBe('blob://some/key');
  });

  it('leaves small strings untouched (below 100 char threshold)', () => {
    const input = { type: 'image', data: SMALL_BASE64, mimeType: 'image/png' };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.data).toBe(SMALL_BASE64);
  });

  it('leaves http URLs untouched', () => {
    const input = { type: 'image', data: 'https://example.com/img.png', mimeType: 'image/png' };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.data).toBe('https://example.com/img.png');
  });

  it('recursively strips nested binary parts', () => {
    const input = {
      toolResult: [
        { type: 'text', text: 'Ticket info' },
        { type: 'image', data: LARGE_BASE64, mimeType: 'image/jpeg' },
      ],
    };
    const result = stripBinaryDataForObservability(input) as any;
    expect(result.toolResult[0]).toEqual({ type: 'text', text: 'Ticket info' });
    expect(result.toolResult[1].data).toMatch(/^\[binary data/);
  });

  it('handles arrays at top level', () => {
    const input = [
      { type: 'text', text: 'hi' },
      { type: 'image', data: LARGE_BASE64, mimeType: 'image/png' },
    ];
    const result = stripBinaryDataForObservability(input) as any[];
    expect(result[0]).toEqual({ type: 'text', text: 'hi' });
    expect(result[1].data).toMatch(/^\[binary data/);
  });

  it('passes through non-object primitives unchanged', () => {
    expect(stripBinaryDataForObservability('hello')).toBe('hello');
    expect(stripBinaryDataForObservability(42)).toBe(42);
    expect(stripBinaryDataForObservability(null)).toBeNull();
  });

  it('handles circular references safely', () => {
    const input: Record<string, unknown> = { type: 'container' };
    input.self = input;

    const result = stripBinaryDataForObservability(input) as Record<string, unknown>;
    expect(result.type).toBe('container');
    expect(result.self).toBe('[Circular Reference]');
  });
});

describe('sanitizeArtifactBinaryData', () => {
  let mockUpload: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockUpload = vi.fn().mockResolvedValue(undefined);
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    vi.mocked(getBlobStorageProvider).mockReturnValue({
      upload: mockUpload,
      download: vi.fn(),
      delete: vi.fn(),
    });
  });

  it('uploads an inline image part and replaces data with blob:// URI', async () => {
    const input = { type: 'image', data: LARGE_BASE64, mimeType: 'image/png' };
    const result = (await sanitizeArtifactBinaryData(input, CTX)) as any;

    expect(mockUpload).toHaveBeenCalledOnce();
    expect(result.type).toBe('image');
    expect(result.data).toMatch(/^blob:\/\//);
    expect(result.mimeType).toBe('image/png');
  });

  it('preserves non-binary fields on the image part', async () => {
    const input = { type: 'image', data: LARGE_BASE64, mimeType: 'image/jpeg', extra: 'keep' };
    const result = (await sanitizeArtifactBinaryData(input, CTX)) as any;
    expect(result.extra).toBe('keep');
  });

  it('does not re-upload data that is already a blob:// URI', async () => {
    const input = { type: 'image', data: 'blob://v1/t_x/artifact-data/p_y/a_z/sha256-abc.png' };
    await sanitizeArtifactBinaryData(input, CTX);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('recursively sanitizes nested structures', async () => {
    const input = {
      toolResult: [
        { type: 'text', text: 'Ticket data' },
        { type: 'image', data: LARGE_BASE64, mimeType: 'image/png' },
      ],
      toolName: 'get-zendesk-ticket',
    };
    const result = (await sanitizeArtifactBinaryData(input, CTX)) as any;

    expect(result.toolName).toBe('get-zendesk-ticket');
    expect(result.toolResult[0]).toEqual({ type: 'text', text: 'Ticket data' });
    expect(result.toolResult[1].data).toMatch(/^blob:\/\//);
    expect(mockUpload).toHaveBeenCalledOnce();
  });

  it('uploads multiple image parts independently', async () => {
    const input = {
      images: [
        { type: 'image', data: LARGE_BASE64, mimeType: 'image/png' },
        { type: 'image', data: LARGE_BASE64, mimeType: 'image/jpeg' },
      ],
    };
    await sanitizeArtifactBinaryData(input, CTX);
    expect(mockUpload).toHaveBeenCalledTimes(2);
  });

  it('leaves non-binary values unchanged', async () => {
    const input = {
      toolName: 'search',
      toolInput: { query: 'test' },
      count: 5,
      flag: true,
    };
    const result = await sanitizeArtifactBinaryData(input, CTX);
    expect(result).toEqual(input);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it('produces a deterministic blob:// URI via content hash', async () => {
    const input = { type: 'image', data: LARGE_BASE64, mimeType: 'image/png' };
    const r1 = (await sanitizeArtifactBinaryData(input, CTX)) as any;
    const r2 = (await sanitizeArtifactBinaryData(input, CTX)) as any;
    expect(r1.data).toBe(r2.data);
  });

  it('handles circular references safely', async () => {
    const input: Record<string, unknown> = {
      toolResult: [{ type: 'image', data: LARGE_BASE64, mimeType: 'image/png' }],
    };
    input.self = input;

    const result = (await sanitizeArtifactBinaryData(input, CTX)) as Record<string, unknown>;
    expect(result.self).toBe('[Circular Reference]');
    expect(mockUpload).toHaveBeenCalledOnce();
  });
});
