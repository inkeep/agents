import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../../../../env';
import { getLogger } from '../../../../logger';
import type {
  BlobStorageDownloadResult,
  BlobStorageProvider,
  BlobStorageUploadParams,
} from './types';

const logger = getLogger('s3-blob-storage');

export class S3BlobStorageProvider implements BlobStorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = env.BLOB_STORAGE_S3_BUCKET;
    this.client = new S3Client({
      endpoint: env.BLOB_STORAGE_S3_ENDPOINT,
      region: env.BLOB_STORAGE_S3_REGION,
      credentials: {
        accessKeyId: env.BLOB_STORAGE_S3_ACCESS_KEY_ID,
        secretAccessKey: env.BLOB_STORAGE_S3_SECRET_ACCESS_KEY,
      },
      forcePathStyle: env.BLOB_STORAGE_S3_FORCE_PATH_STYLE,
    });
  }

  async upload(params: BlobStorageUploadParams): Promise<void> {
    logger.debug({ key: params.key, contentType: params.contentType }, 'Uploading to S3');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: params.key,
        Body: params.data,
        ContentType: params.contentType,
      })
    );
  }

  async download(key: string): Promise<BlobStorageDownloadResult> {
    logger.debug({ key }, 'Downloading from S3');
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );

    const bodyBytes = await response.Body?.transformToByteArray();
    if (!bodyBytes) {
      throw new Error(`Empty response body for key: ${key}`);
    }

    return {
      data: bodyBytes,
      contentType: response.ContentType || 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<void> {
    logger.debug({ key }, 'Deleting from S3');
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
    );
  }

  async getPresignedUrl(key: string, expiresInSeconds = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }
}
