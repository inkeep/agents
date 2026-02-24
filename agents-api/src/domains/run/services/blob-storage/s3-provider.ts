import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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
    const bucket = env.BLOB_STORAGE_S3_BUCKET;
    const accessKeyId = env.BLOB_STORAGE_S3_ACCESS_KEY_ID;
    const secretAccessKey = env.BLOB_STORAGE_S3_SECRET_ACCESS_KEY;
    const region = env.BLOB_STORAGE_S3_REGION;
    if (!bucket || !accessKeyId || !secretAccessKey || !region) {
      throw new Error(
        'S3 blob storage requires BLOB_STORAGE_S3_BUCKET, BLOB_STORAGE_S3_ACCESS_KEY_ID, BLOB_STORAGE_S3_SECRET_ACCESS_KEY, and BLOB_STORAGE_S3_REGION'
      );
    }
    this.bucket = bucket;
    this.client = new S3Client({
      endpoint: env.BLOB_STORAGE_S3_ENDPOINT,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: env.BLOB_STORAGE_S3_FORCE_PATH_STYLE,
    });
  }

  async upload(params: BlobStorageUploadParams): Promise<void> {
    logger.debug({ key: params.key, contentType: params.contentType }, 'Uploading to S3');
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: params.key,
          Body: params.data,
          ContentType: params.contentType,
        })
      );
    } catch (error) {
      logger.error({ key: params.key, bucket: this.bucket, error }, 'S3 upload failed');
      throw new Error(
        `S3 upload failed for key ${params.key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
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
}
