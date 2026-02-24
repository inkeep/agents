import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import type {
  BlobStorageDownloadResult,
  BlobStorageProvider,
  BlobStorageUploadParams,
} from './types';

const logger = getLogger('local-blob-storage');

export class LocalBlobStorageProvider implements BlobStorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = path.resolve(env.BLOB_STORAGE_LOCAL_PATH);
  }

  private keyToPath(key: string): string {
    if (key.includes('\0')) {
      throw new Error(`Invalid blob key: ${key}`);
    }

    const decodedKey = decodeURIComponent(key);
    const resolvedPath = path.resolve(this.basePath, decodedKey);
    const relativePath = path.relative(this.basePath, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Invalid blob key: ${key}`);
    }

    return resolvedPath;
  }

  async upload(params: BlobStorageUploadParams): Promise<void> {
    const filePath = this.keyToPath(params.key);
    await mkdir(path.dirname(filePath), { recursive: true });
    const buf =
      params.data instanceof Buffer ? params.data : Buffer.from(params.data as Uint8Array);
    await writeFile(filePath, buf);
    logger.debug({ key: params.key, path: filePath }, 'Uploaded to local storage');
  }

  async download(key: string): Promise<BlobStorageDownloadResult> {
    const filePath = this.keyToPath(key);
    const buf = await readFile(filePath);
    const ext = path.extname(key).toLowerCase();
    const contentType =
      ext === '.png'
        ? 'image/png'
        : ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.gif'
            ? 'image/gif'
            : ext === '.webp'
              ? 'image/webp'
              : ext === '.svg'
                ? 'image/svg+xml'
                : 'application/octet-stream';
    return {
      data: new Uint8Array(buf),
      contentType,
    };
  }

  async delete(key: string): Promise<void> {
    const filePath = this.keyToPath(key);
    await rm(filePath, { force: true });
    logger.debug({ key }, 'Deleted from local storage');
  }
}
