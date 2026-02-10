import { getLogger } from '../../../../logger';
import { S3BlobStorageProvider } from './s3-provider';
import type { BlobStorageProvider } from './types';

export type {
  BlobStorageDownloadResult,
  BlobStorageProvider,
  BlobStorageUploadParams,
} from './types';

const logger = getLogger('blob-storage');

let instance: BlobStorageProvider | null = null;

export function getBlobStorageProvider(): BlobStorageProvider {
  if (!instance) {
    logger.info({}, 'Initializing S3 blob storage provider');
    instance = new S3BlobStorageProvider();
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
