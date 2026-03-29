import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('blob storage factory', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('identifies blob URIs', async () => {
    const { isBlobUri } = await import('../blob-storage/index');
    expect(isBlobUri('blob://tenant/project/key')).toBe(true);
    expect(isBlobUri('https://example.com')).toBe(false);
    expect(isBlobUri('data:image/png;base64,abc')).toBe(false);
  });

  it('converts key to blob URI and back', async () => {
    const { toBlobUri, fromBlobUri } = await import('../blob-storage/index');
    const key = 'v1/t_tenant/media/p_project/conv/c_conv123/m_msg456/sha256-abcdef.png';
    const uri = toBlobUri(key);
    expect(uri).toBe(
      'blob://v1/t_tenant/media/p_project/conv/c_conv123/m_msg456/sha256-abcdef.png'
    );
    expect(fromBlobUri(uri)).toBe(key);
  });

  it('throws for non-blob URI', async () => {
    const { fromBlobUri } = await import('../blob-storage/index');
    expect(() => fromBlobUri('https://example.com')).toThrow('Not a blob URI');
  });

  it('prefers S3 provider when S3 and Vercel config are both set', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-s3-precedence-'));
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_LOCAL_PATH: dir,
        BLOB_STORAGE_S3_ENDPOINT: 'http://localhost:9000',
        BLOB_STORAGE_S3_BUCKET: 'bucket',
        BLOB_STORAGE_S3_REGION: 'us-east-1',
        BLOB_STORAGE_S3_ACCESS_KEY_ID: 'key',
        BLOB_STORAGE_S3_SECRET_ACCESS_KEY: 'secret',
        BLOB_STORAGE_S3_FORCE_PATH_STYLE: true,
        BLOB_READ_WRITE_TOKEN: 'token',
      },
    }));

    vi.resetModules();
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    const { S3BlobStorageProvider } = await import('../blob-storage/s3-provider');
    const provider = getBlobStorageProvider();
    expect(provider).toBeInstanceOf(S3BlobStorageProvider);
  });

  it('uses Vercel provider when S3 is not configured and token is set', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-vercel-precedence-'));
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_LOCAL_PATH: dir,
        BLOB_READ_WRITE_TOKEN: 'token',
      },
    }));

    vi.resetModules();
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    const { VercelBlobStorageProvider } = await import('../blob-storage/vercel-blob-provider');
    const provider = getBlobStorageProvider();
    expect(provider).toBeInstanceOf(VercelBlobStorageProvider);
  });

  it('falls back to local provider when no remote config is set', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-local-fallback-'));
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_LOCAL_PATH: dir,
      },
    }));

    vi.resetModules();
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    const { LocalBlobStorageProvider } = await import('../blob-storage/local-provider');
    const provider = getBlobStorageProvider();
    expect(provider).toBeInstanceOf(LocalBlobStorageProvider);
  });

  it('returns the same singleton instance across calls', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-singleton-'));
    vi.doMock('../../../../env', () => ({
      env: {
        BLOB_STORAGE_LOCAL_PATH: dir,
      },
    }));

    vi.resetModules();
    const { getBlobStorageProvider } = await import('../blob-storage/index');
    const a = getBlobStorageProvider();
    const b = getBlobStorageProvider();
    expect(a).toBe(b);
  });
});
