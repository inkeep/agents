import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMock = vi.fn();
const S3ClientMock = vi.fn().mockImplementation(() => ({
  send: sendMock,
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: S3ClientMock,
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
  DeleteObjectCommand: vi.fn(),
}));

vi.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: vi.fn().mockImplementation(() => ({})),
}));

describe('S3BlobStorageProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('throws a targeted error when required env vars are missing', async () => {
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_S3_BUCKET: 'bucket',
        BLOB_STORAGE_S3_REGION: 'us-east-1',
      },
    }));

    const { S3BlobStorageProvider } = await import('../blob-storage/s3-provider');
    expect(() => new S3BlobStorageProvider()).toThrow(
      'S3 blob storage requires BLOB_STORAGE_S3_ACCESS_KEY_ID, BLOB_STORAGE_S3_SECRET_ACCESS_KEY'
    );
  });

  it('wraps upload errors with key context', async () => {
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_S3_ENDPOINT: 'http://localhost:9000',
        BLOB_STORAGE_S3_BUCKET: 'bucket',
        BLOB_STORAGE_S3_REGION: 'us-east-1',
        BLOB_STORAGE_S3_ACCESS_KEY_ID: 'key',
        BLOB_STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
        BLOB_STORAGE_S3_FORCE_PATH_STYLE: true,
      },
    }));
    sendMock.mockRejectedValueOnce(new Error('AccessDenied'));

    const { S3BlobStorageProvider } = await import('../blob-storage/s3-provider');
    const provider = new S3BlobStorageProvider();

    await expect(
      provider.upload({
        key: 'tenant/project/file.png',
        data: new Uint8Array([1]),
        contentType: 'image/png',
      })
    ).rejects.toThrow('S3 upload failed for key tenant/project/file.png: AccessDenied');
  });

  it('wraps download errors with key context', async () => {
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_S3_ENDPOINT: 'http://localhost:9000',
        BLOB_STORAGE_S3_BUCKET: 'bucket',
        BLOB_STORAGE_S3_REGION: 'us-east-1',
        BLOB_STORAGE_S3_ACCESS_KEY_ID: 'key',
        BLOB_STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
        BLOB_STORAGE_S3_FORCE_PATH_STYLE: true,
      },
    }));
    sendMock.mockResolvedValueOnce({ Body: undefined });

    const { S3BlobStorageProvider } = await import('../blob-storage/s3-provider');
    const provider = new S3BlobStorageProvider();

    await expect(provider.download('tenant/project/file.png')).rejects.toThrow(
      'S3 download failed for key tenant/project/file.png: Empty response body for key: tenant/project/file.png'
    );
  });

  it('wraps delete errors with key context', async () => {
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_S3_ENDPOINT: 'http://localhost:9000',
        BLOB_STORAGE_S3_BUCKET: 'bucket',
        BLOB_STORAGE_S3_REGION: 'us-east-1',
        BLOB_STORAGE_S3_ACCESS_KEY_ID: 'key',
        BLOB_STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
        BLOB_STORAGE_S3_FORCE_PATH_STYLE: true,
      },
    }));
    sendMock.mockRejectedValueOnce(new Error('NoSuchKey'));

    const { S3BlobStorageProvider } = await import('../blob-storage/s3-provider');
    const provider = new S3BlobStorageProvider();

    await expect(provider.delete('tenant/project/file.png')).rejects.toThrow(
      'S3 delete failed for key tenant/project/file.png: NoSuchKey'
    );
  });
});
