import { del, head, put } from '@vercel/blob';
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
    this.token = env.BLOB_READ_WRITE_TOKEN?.trim() || undefined;
  }

  async upload(params: BlobStorageUploadParams): Promise<void> {
    logger.debug({ key: params.key, contentType: params.contentType }, 'Uploading to Vercel Blob');
    const body =
      params.data instanceof Buffer ? params.data : Buffer.from(params.data as Uint8Array);
    await put(params.key, body, {
      access: 'public',
      contentType: params.contentType,
      token: this.token,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
  }

  async download(key: string): Promise<BlobStorageDownloadResult> {
    logger.debug({ key }, 'Downloading from Vercel Blob');
    const meta = await head(key, { token: this.token });
    const res = await fetch(meta.url);
    if (!res.ok) {
      throw new Error(`Vercel Blob download failed for key ${key}: ${res.status}`);
    }
    const data = new Uint8Array(await res.arrayBuffer());
    return {
      data,
      contentType: meta.contentType || 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<void> {
    logger.debug({ key }, 'Deleting from Vercel Blob');
    await del(key, { token: this.token });
  }

  async getPresignedUrl(key: string, _expiresInSeconds?: number): Promise<string> {
    const meta = await head(key, { token: this.token });
    return meta.url;
  }
}
