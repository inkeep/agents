import { beforeEach, describe, expect, it, vi } from 'vitest';

const putMock = vi.fn();
const getMock = vi.fn();
const delMock = vi.fn();

vi.mock('@vercel/blob', () => ({
  put: putMock,
  get: getMock,
  del: delMock,
}));

describe('VercelBlobStorageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('trims token before passing it to SDK methods', async () => {
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_VERCEL_READ_WRITE_TOKEN: '  my-token  ',
      },
    }));
    putMock.mockResolvedValueOnce({});

    const { VercelBlobStorageProvider } = await import('../blob-storage/vercel-blob-provider');
    const provider = new VercelBlobStorageProvider();
    await provider.upload({
      key: 'tenant/project/file.png',
      data: new Uint8Array([1]),
      contentType: 'image/png',
    });

    expect(putMock).toHaveBeenCalledWith(
      'tenant/project/file.png',
      expect.any(Buffer),
      expect.objectContaining({ token: 'my-token' })
    );
  });

  it('wraps upload errors with key context', async () => {
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_VERCEL_READ_WRITE_TOKEN: 'token',
      },
    }));
    putMock.mockRejectedValueOnce(new Error('Upload failed'));

    const { VercelBlobStorageProvider } = await import('../blob-storage/vercel-blob-provider');
    const provider = new VercelBlobStorageProvider();
    await expect(
      provider.upload({
        key: 'tenant/project/file.png',
        data: new Uint8Array([1]),
        contentType: 'image/png',
      })
    ).rejects.toThrow('Vercel Blob upload failed for key tenant/project/file.png: Upload failed');
  });

  it('downloads data and preserves content type', async () => {
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_VERCEL_READ_WRITE_TOKEN: 'token',
      },
    }));
    getMock.mockResolvedValueOnce({
      statusCode: 200,
      stream: new Response(new Uint8Array([1, 2, 3])).body,
      blob: { contentType: 'image/png' },
    });

    const { VercelBlobStorageProvider } = await import('../blob-storage/vercel-blob-provider');
    const provider = new VercelBlobStorageProvider();
    const result = await provider.download('tenant/project/file.png');
    expect(result.data).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.contentType).toBe('image/png');
  });

  it('wraps download errors with key context', async () => {
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_VERCEL_READ_WRITE_TOKEN: 'token',
      },
    }));
    getMock.mockResolvedValueOnce({ statusCode: 404, stream: null });

    const { VercelBlobStorageProvider } = await import('../blob-storage/vercel-blob-provider');
    const provider = new VercelBlobStorageProvider();
    await expect(provider.download('tenant/project/file.png')).rejects.toThrow(
      'Vercel Blob download failed for key tenant/project/file.png'
    );
  });

  it('wraps delete errors with key context', async () => {
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_VERCEL_READ_WRITE_TOKEN: 'token',
      },
    }));
    delMock.mockRejectedValueOnce(new Error('Delete failed'));

    const { VercelBlobStorageProvider } = await import('../blob-storage/vercel-blob-provider');
    const provider = new VercelBlobStorageProvider();
    await expect(provider.delete('tenant/project/file.png')).rejects.toThrow(
      'Vercel Blob delete failed for key tenant/project/file.png: Delete failed'
    );
  });
});
