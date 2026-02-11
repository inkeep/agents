import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadPartsImages } from '../../../domains/run/services/blob-storage/image-upload';

const mockUpload = vi.fn();
const mockLookup = vi.fn();

vi.mock('node:dns/promises', () => ({
  lookup: mockLookup,
}));

vi.mock('../../../domains/run/services/blob-storage/index', () => ({
  getBlobStorageProvider: () => ({
    upload: mockUpload,
  }),
  toBlobUri: (key: string) => `blob://${key}`,
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
    mockLookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  });

  it('uploads a valid external image and stores a blob URI', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(PNG_BYTES, {
          status: 200,
          headers: {
            'content-type': 'image/jpeg',
            'content-length': String(PNG_BYTES.length),
          },
        })
      )
    );

    const parts = [{ kind: 'file', file: { uri: 'https://example.com/image.jpg' } }] as any[];
    const uploaded = await uploadPartsImages(parts, uploadContext);

    expect(mockUpload).toHaveBeenCalledTimes(1);
    expect(uploaded).toHaveLength(1);
    expect(uploaded[0]).toMatchObject({
      kind: 'file',
      file: {
        uri: expect.stringContaining('blob://tenant/project/conversation/message/0-'),
        mimeType: 'image/png',
      },
    });
  });

  it('blocks URLs to private IPs', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const parts = [{ kind: 'file', file: { uri: 'http://127.0.0.1/internal.png' } }] as any[];
    const uploaded = await uploadPartsImages(parts, uploadContext);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(uploaded).toEqual([]);
  });

  it('re-validates redirects and blocks redirected private IPs', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, {
            status: 302,
            headers: { location: 'http://127.0.0.1/private.png' },
          })
        )
        .mockResolvedValueOnce(
          new Response(PNG_BYTES, {
            status: 200,
            headers: { 'content-type': 'image/png' },
          })
        )
    );

    const parts = [{ kind: 'file', file: { uri: 'https://example.com/redirect' } }] as any[];
    const uploaded = await uploadPartsImages(parts, uploadContext);

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(mockUpload).not.toHaveBeenCalled();
    expect(uploaded).toEqual([]);
  });

  it('blocks external responses with non-image content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>not an image</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        })
      )
    );

    const parts = [{ kind: 'file', file: { uri: 'https://example.com/page' } }] as any[];
    const uploaded = await uploadPartsImages(parts, uploadContext);

    expect(mockUpload).not.toHaveBeenCalled();
    expect(uploaded).toEqual([]);
  });

  it('blocks oversized inline file bytes', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const large = Buffer.alloc(11 * 1024 * 1024, 1).toString('base64');
    const parts = [{ kind: 'file', file: { bytes: large, mimeType: 'image/png' } }] as any[];

    const uploaded = await uploadPartsImages(parts, uploadContext);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
    expect(uploaded).toEqual([]);
  });
});
