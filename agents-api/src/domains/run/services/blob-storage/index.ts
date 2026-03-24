import { env } from '../../../../env';
import { LocalBlobStorageProvider } from './local-provider';
import { S3BlobStorageProvider } from './s3-provider';
import type { BlobStorageProvider } from './types';
import { VercelBlobStorageProvider } from './vercel-blob-provider';

export type {
  BlobStorageDownloadResult,
  BlobStorageProvider,
  BlobStorageUploadParams,
} from './types';

let instance: BlobStorageProvider | null = null;

/**
 * Returns the configured blob storage provider with precedence:
 * 1) S3 when BLOB_STORAGE_S3_BUCKET is set
 * 2) Vercel when BLOB_READ_WRITE_TOKEN is set
 * 3) Local fallback otherwise
 *
 * Stored keys do not encode backend; changing provider strategy after uploads
 * can cause existing media URLs to 404.
 */
export function getBlobStorageProvider(): BlobStorageProvider {
  if (!instance) {
    if (env.BLOB_STORAGE_S3_BUCKET?.trim()) {
      instance = new S3BlobStorageProvider();
    } else if (env.BLOB_READ_WRITE_TOKEN?.trim()) {
      instance = new VercelBlobStorageProvider();
    } else {
      instance = new LocalBlobStorageProvider();
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
