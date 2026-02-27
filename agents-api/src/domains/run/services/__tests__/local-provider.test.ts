import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('LocalBlobStorageProvider', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('uploads and downloads round-trip data', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-roundtrip-'));
    vi.doMock('../../../../env', () => ({
      env: { BLOB_STORAGE_LOCAL_PATH: dir },
    }));

    const { LocalBlobStorageProvider } = await import('../blob-storage/local-provider');
    const provider = new LocalBlobStorageProvider();
    const key = 'tenant/project/conv/msg/abc.png';
    const data = new Uint8Array([1, 2, 3]);

    await provider.upload({ key, data, contentType: 'image/png' });
    const result = await provider.download(key);

    expect(result.data).toEqual(data);
    expect(result.contentType).toBe('image/png');
  });

  it('supports zero-byte uploads', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-zero-byte-'));
    vi.doMock('../../../../env', () => ({
      env: { BLOB_STORAGE_LOCAL_PATH: dir },
    }));

    const { LocalBlobStorageProvider } = await import('../blob-storage/local-provider');
    const provider = new LocalBlobStorageProvider();
    const key = 'tenant/project/zero.bin';

    await provider.upload({
      key,
      data: new Uint8Array([]),
      contentType: 'application/octet-stream',
    });
    const result = await provider.download(key);
    expect(result.data.length).toBe(0);
    expect(result.contentType).toBe('application/octet-stream');
  });

  it('warns when overwriting an existing key', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-overwrite-'));
    const warn = vi.fn();
    vi.doMock('../../../../logger', () => ({
      getLogger: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn,
        error: vi.fn(),
      }),
    }));
    vi.doMock('../../../../env', () => ({
      env: { BLOB_STORAGE_LOCAL_PATH: dir },
    }));

    const { LocalBlobStorageProvider } = await import('../blob-storage/local-provider');
    const provider = new LocalBlobStorageProvider();
    const key = 'tenant/project/dup.png';

    await provider.upload({ key, data: new Uint8Array([1]), contentType: 'image/png' });
    await provider.upload({ key, data: new Uint8Array([2]), contentType: 'image/png' });

    const result = await provider.download(key);
    expect(result.data).toEqual(new Uint8Array([2]));
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ key }),
      'Overwriting existing local blob'
    );
  });

  it('rejects path traversal keys', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-traversal-'));
    vi.doMock('../../../../env', () => ({
      env: { BLOB_STORAGE_LOCAL_PATH: dir },
    }));

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

  it('rejects null byte keys', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-null-byte-'));
    vi.doMock('../../../../env', () => ({
      env: { BLOB_STORAGE_LOCAL_PATH: dir },
    }));

    const { LocalBlobStorageProvider } = await import('../blob-storage/local-provider');
    const provider = new LocalBlobStorageProvider();

    await expect(
      provider.upload({
        key: 'bad\0name.png',
        data: new Uint8Array([1]),
        contentType: 'image/png',
      })
    ).rejects.toThrow('Invalid blob key');
  });

  it('rejects malformed percent encoding keys', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-invalid-encoding-'));
    vi.doMock('../../../../env', () => ({
      env: { BLOB_STORAGE_LOCAL_PATH: dir },
    }));

    const { LocalBlobStorageProvider } = await import('../blob-storage/local-provider');
    const provider = new LocalBlobStorageProvider();

    await expect(
      provider.upload({
        key: 'bad%2',
        data: new Uint8Array([1]),
        contentType: 'image/png',
      })
    ).rejects.toThrow('Invalid blob key');
  });

  it('rejects symlink traversal to files outside base path', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-symlink-'));
    const outsideDir = mkdtempSync(path.join(tmpdir(), 'blob-symlink-outside-'));
    const outsideFilePath = path.join(outsideDir, 'outside.txt');
    writeFileSync(outsideFilePath, Buffer.from('secret'));
    symlinkSync(outsideDir, path.join(dir, 'link'));

    vi.doMock('../../../../env', () => ({
      env: { BLOB_STORAGE_LOCAL_PATH: dir },
    }));

    const { LocalBlobStorageProvider } = await import('../blob-storage/local-provider');
    const provider = new LocalBlobStorageProvider();

    await expect(provider.download('link/outside.txt')).rejects.toThrow('Invalid blob key');
    await expect(
      provider.upload({
        key: 'link/new.txt',
        data: new Uint8Array([1]),
        contentType: 'text/plain',
      })
    ).rejects.toThrow('Invalid blob key');
  });

  it('deletes existing files', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'blob-delete-'));
    vi.doMock('../../../../env', () => ({
      env: { BLOB_STORAGE_LOCAL_PATH: dir },
    }));

    const { LocalBlobStorageProvider } = await import('../blob-storage/local-provider');
    const provider = new LocalBlobStorageProvider();
    const key = 'tenant/project/to-delete.png';

    await provider.upload({ key, data: new Uint8Array([1]), contentType: 'image/png' });
    await provider.delete(key);
    await expect(provider.download(key)).rejects.toThrow();
  });
});
