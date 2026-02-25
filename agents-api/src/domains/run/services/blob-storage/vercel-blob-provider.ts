import { del, get, put } from '@vercel/blob';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import type {
  BlobStorageDownloadResult,
  BlobStorageProvider,
  BlobStorageUploadParams,
} from './types';

const logger = getLogger('vercel-blob-storage');

export class VercelBlobStorageProvider implements BlobStorageProvider {
  private token: string | undefined;

  constructor() {
    this.token = env.BLOB_STORAGE_VERCEL_READ_WRITE_TOKEN?.trim() || undefined;
    logger.info({}, 'Initializing Vercel Blob storage provider');
  }

  async upload(params: BlobStorageUploadParams): Promise<void> {
    logger.debug({ key: params.key, contentType: params.contentType }, 'Uploading to Vercel Blob');
    try {
      const body =
        params.data instanceof Buffer ? params.data : Buffer.from(params.data as Uint8Array);
      await put(params.key, body, {
        access: 'private',
        contentType: params.contentType,
        token: this.token,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
    } catch (error) {
      logger.error({ key: params.key, error }, 'Vercel Blob upload failed');
      throw new Error(
        `Vercel Blob upload failed for key ${params.key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async download(key: string): Promise<BlobStorageDownloadResult> {
    logger.debug({ key }, 'Downloading from Vercel Blob');
    try {
      const result = await get(key, {
        access: 'private',
        token: this.token,
      });
      if (result?.statusCode !== 200 || !result.stream) {
        throw new Error(
          `Vercel Blob download failed for key ${key}: ${result?.statusCode ?? 'no result'}`
        );
      }
      const data = new Uint8Array(await new Response(result.stream).arrayBuffer());
      return {
        data,
        contentType: result.blob.contentType || 'application/octet-stream',
      };
    } catch (error) {
      logger.error({ key, error }, 'Vercel Blob download failed');
      throw new Error(
        `Vercel Blob download failed for key ${key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async delete(key: string): Promise<void> {
    logger.debug({ key }, 'Deleting from Vercel Blob');
    try {
      await del(key, { token: this.token });
    } catch (error) {
      logger.error({ key, error }, 'Vercel Blob delete failed');
      throw new Error(
        `Vercel Blob delete failed for key ${key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
