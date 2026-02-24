import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const s3TestEnv = {
  BLOB_STORAGE_PROVIDER: 's3',
  BLOB_STORAGE_LOCAL_PATH: '.blob-storage',
  BLOB_STORAGE_S3_ENDPOINT: 'http://localhost:9000',
  BLOB_STORAGE_S3_BUCKET: 'test-bucket',
  BLOB_STORAGE_S3_REGION: 'us-east-1',
  BLOB_STORAGE_S3_ACCESS_KEY_ID: 'test-key',
  BLOB_STORAGE_S3_SECRET_ACCESS_KEY: 'test-secret',
  BLOB_STORAGE_S3_FORCE_PATH_STYLE: true,
};

vi.mock('../../../../env', () => ({
  env: s3TestEnv,
}));

describe('Blob storage abstraction', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe('URI helpers', () => {
    it('identifies blob URIs', async () => {
      const { isBlobUri } = await import('../blob-storage/index');
      expect(isBlobUri('blob://tenant/project/key')).toBe(true);
      expect(isBlobUri('https://example.com')).toBe(false);
      expect(isBlobUri('data:image/png;base64,abc')).toBe(false);
    });

    it('converts key to blob URI and back', async () => {
      const { toBlobUri, fromBlobUri } = await import('../blob-storage/index');
      const key = 'tenant/project/conv/msg/hash.png';
      const uri = toBlobUri(key);
      expect(uri).toBe('blob://tenant/project/conv/msg/hash.png');
      expect(fromBlobUri(uri)).toBe(key);
    });

    it('fromBlobUri throws for non-blob URI', async () => {
      const { fromBlobUri } = await import('../blob-storage/index');
      expect(() => fromBlobUri('https://example.com')).toThrow('Not a blob URI');
    });
  });

  describe('getBlobStorageProvider', () => {
    it('returns S3 provider when BLOB_STORAGE_PROVIDER is s3', async () => {
      const { getBlobStorageProvider } = await import('../blob-storage/index');
      const provider = getBlobStorageProvider();
      expect(provider).toBeDefined();
      expect(provider.upload).toBeDefined();
      expect(provider.download).toBeDefined();
      expect(provider.delete).toBeDefined();
    });

    it('returns same instance on multiple calls', async () => {
      const { getBlobStorageProvider } = await import('../blob-storage/index');
      const a = getBlobStorageProvider();
      const b = getBlobStorageProvider();
      expect(a).toBe(b);
    });

    it('returns local provider when BLOB_STORAGE_PROVIDER is local', async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'blob-test-'));
      vi.doMock('../../../../env', () => ({
        env: {
          BLOB_STORAGE_PROVIDER: 'local',
          BLOB_STORAGE_LOCAL_PATH: dir,
        },
      }));
      vi.resetModules();
      const { getBlobStorageProvider } = await import('../blob-storage/index');
      const provider = getBlobStorageProvider();
      expect(provider).toBeDefined();
      expect(provider.upload).toBeDefined();
      expect(provider.download).toBeDefined();
    });
  });

  describe('S3BlobStorageProvider', () => {
    it('implements BlobStorageProvider interface', async () => {
      vi.doMock('../../../../env', () => ({
        env: s3TestEnv,
      }));
      vi.resetModules();
      const { S3BlobStorageProvider } = await import('../blob-storage/s3-provider');
      const provider = new S3BlobStorageProvider();
      expect(typeof provider.upload).toBe('function');
      expect(typeof provider.download).toBe('function');
      expect(typeof provider.delete).toBe('function');
    });
  });

  describe('VercelBlobStorageProvider', () => {
    it('implements BlobStorageProvider interface', async () => {
      const { VercelBlobStorageProvider } = await import('../blob-storage/vercel-blob-provider');
      const provider = new VercelBlobStorageProvider();
      expect(typeof provider.upload).toBe('function');
      expect(typeof provider.download).toBe('function');
      expect(typeof provider.delete).toBe('function');
    });
  });

  describe('LocalBlobStorageProvider', () => {
    it('implements BlobStorageProvider interface', async () => {
      const { LocalBlobStorageProvider } = await import('../blob-storage/local-provider');
      const provider = new LocalBlobStorageProvider();
      expect(typeof provider.upload).toBe('function');
      expect(typeof provider.download).toBe('function');
      expect(typeof provider.delete).toBe('function');
    });

    it('upload and download round-trip', async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'blob-roundtrip-'));
      vi.doMock('../../../../env', () => ({
        env: { BLOB_STORAGE_LOCAL_PATH: dir },
      }));
      vi.resetModules();
      const { LocalBlobStorageProvider } = await import('../blob-storage/local-provider');
      const provider = new LocalBlobStorageProvider();
      const key = 'tenant/project/conv/msg/abc.png';
      const data = new Uint8Array([1, 2, 3]);
      await provider.upload({ key, data, contentType: 'image/png' });
      const result = await provider.download(key);
      expect(result.data).toEqual(data);
      expect(result.contentType).toBe('image/png');
      await provider.delete(key);
      await expect(provider.download(key)).rejects.toThrow();
    });

    it('rejects path traversal keys', async () => {
      const dir = mkdtempSync(path.join(tmpdir(), 'blob-traversal-'));
      vi.doMock('../../../../env', () => ({
        env: { BLOB_STORAGE_LOCAL_PATH: dir },
      }));
      vi.resetModules();
      const { LocalBlobStorageProvider } = await import('../blob-storage/local-provider');
      const provider = new LocalBlobStorageProvider();

      await expect(
        provider.upload({
          key: '../outside.txt',
          data: new Uint8Array([1]),
          contentType: 'text/plain',
        })
      ).rejects.toThrow('Invalid blob key');

      await expect(
        provider.upload({
          key: '%2e%2e/outside.txt',
          data: new Uint8Array([1]),
          contentType: 'text/plain',
        })
      ).rejects.toThrow('Invalid blob key');

      await expect(
        provider.upload({
          key: '/tmp/outside.txt',
          data: new Uint8Array([1]),
          contentType: 'text/plain',
        })
      ).rejects.toThrow('Invalid blob key');
    });
  });
});
