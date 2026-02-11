import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import { S3BlobStorageProvider } from './s3-provider';
import type { BlobStorageProvider } from './types';
import { VercelBlobStorageProvider } from './vercel-blob-provider';

export type {
  BlobStorageDownloadResult,
  BlobStorageProvider,
  BlobStorageUploadParams,
} from './types';

const logger = getLogger('blob-storage');

let instance: BlobStorageProvider | null = null;

/**
 * Returns the configured blob storage provider (S3 or Vercel). Stored keys do not
 * encode which backend was used. Do not change BLOB_STORAGE_PROVIDER after uploads
 * have been made—existing media URLs may 404. Migration between backends is the
 * deployer's responsibility.
 */
export function getBlobStorageProvider(): BlobStorageProvider {
  if (!instance) {
    const provider = env.BLOB_STORAGE_PROVIDER ?? 's3';
    if (provider === 'vercel') {
      logger.info({}, 'Initializing Vercel Blob storage provider');
      instance = new VercelBlobStorageProvider();
    } else {
      logger.info({}, 'Initializing S3 blob storage provider');
      instance = new S3BlobStorageProvider();
    }
  }
  return instance;
}

export const BLOB_URI_PREFIX = 'blob://';

export function isBlobUri(uri: string): boolean {
  return uri.startsWith(BLOB_URI_PREFIX);
}

export function toBlobUri(key: string): string {
  return `${BLOB_URI_PREFIX}${key}`;
}

export function fromBlobUri(uri: string): string {
  if (!isBlobUri(uri)) {
    throw new Error(`Not a blob URI: ${uri}`);
  }
  return uri.slice(BLOB_URI_PREFIX.length);
}
