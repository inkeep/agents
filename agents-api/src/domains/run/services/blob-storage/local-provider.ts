import { access, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getMimeTypeFromExtension } from '@inkeep/agents-core/constants/allowed-image-formats';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import type {
  BlobStorageDownloadResult,
  BlobStorageProvider,
  BlobStorageUploadParams,
} from './types';

const logger = getLogger('LocalBlobStorageProvider');

export class LocalBlobStorageProvider implements BlobStorageProvider {
  private basePath: string;

  constructor() {
    this.basePath = path.resolve(env.BLOB_STORAGE_LOCAL_PATH);
    logger.info({ path: this.basePath }, 'Initializing local blob storage provider');
  }

  private makeInvalidBlobKeyError(key: string): Error {
    return new Error(`Invalid blob key: ${key}`);
  }

  private keyToPath(key: string): string {
    if (key.includes('\0')) {
      throw this.makeInvalidBlobKeyError(key);
    }

    let decodedKey: string;
    try {
      decodedKey = decodeURIComponent(key);
    } catch {
      throw this.makeInvalidBlobKeyError(key);
    }

    if (decodedKey.includes('\0')) {
      throw this.makeInvalidBlobKeyError(key);
    }

    const resolvedPath = path.resolve(this.basePath, decodedKey);
    const relativePath = path.relative(this.basePath, resolvedPath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw this.makeInvalidBlobKeyError(key);
    }

    return resolvedPath;
  }

  private async assertNoSymlinksInResolvedPath(key: string, targetPath: string): Promise<void> {
    const relativePath = path.relative(this.basePath, targetPath);
    if (!relativePath) {
      return;
    }

    let currentPath = this.basePath;
    for (const segment of relativePath.split(path.sep)) {
      currentPath = path.join(currentPath, segment);
      try {
        const stats = await lstat(currentPath);
        if (stats.isSymbolicLink()) {
          throw this.makeInvalidBlobKeyError(key);
        }
      } catch (error) {
        const code = error instanceof Error && 'code' in error ? error.code : undefined;
        if (code === 'ENOENT') {
          return;
        }
        throw error;
      }
    }
  }

  async upload(params: BlobStorageUploadParams): Promise<void> {
    const filePath = this.keyToPath(params.key);
    await this.assertNoSymlinksInResolvedPath(params.key, filePath);
    let fileExists = false;
    try {
      await access(filePath);
      fileExists = true;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? error.code : undefined;
      if (code !== 'ENOENT') {
        logger.warn(
          { key: params.key, path: filePath, error },
          'Unable to check existing local blob'
        );
      }
    }
    if (fileExists) {
      logger.warn({ key: params.key, path: filePath }, 'Overwriting existing local blob');
    }

    try {
      await mkdir(path.dirname(filePath), { recursive: true });
      const buf =
        params.data instanceof Buffer ? params.data : Buffer.from(params.data as Uint8Array);
      await writeFile(filePath, buf);
      logger.debug({ key: params.key, path: filePath }, 'Uploaded to local storage');
    } catch (error) {
      logger.error({ key: params.key, path: filePath, error }, 'Local storage upload failed');
      throw new Error(
        `Local storage upload failed for key ${params.key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async download(key: string): Promise<BlobStorageDownloadResult> {
    const filePath = this.keyToPath(key);
    try {
      await this.assertNoSymlinksInResolvedPath(key, filePath);
      const buf = await readFile(filePath);
      const contentType = getMimeTypeFromExtension(path.extname(key));
      return {
        data: new Uint8Array(buf),
        contentType,
      };
    } catch (error) {
      logger.error({ key, path: filePath, error }, 'Local storage download failed');
      throw new Error(
        `Local storage download failed for key ${key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.keyToPath(key);
    try {
      await this.assertNoSymlinksInResolvedPath(key, filePath);
      await rm(filePath, { force: true });
      logger.debug({ key }, 'Deleted from local storage');
    } catch (error) {
      logger.error({ key, path: filePath, error }, 'Local storage delete failed');
      throw new Error(
        `Local storage delete failed for key ${key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
