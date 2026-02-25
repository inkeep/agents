import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NodeHttpHandler } from '@smithy/node-http-handler';
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
    const requiredEnvVars = [
      ['BLOB_STORAGE_S3_BUCKET', bucket],
      ['BLOB_STORAGE_S3_ACCESS_KEY_ID', accessKeyId],
      ['BLOB_STORAGE_S3_SECRET_ACCESS_KEY', secretAccessKey],
      ['BLOB_STORAGE_S3_REGION', region],
    ] as const;
    const missing = requiredEnvVars.filter(([, value]) => !value).map(([key]) => key);
    if (missing.length > 0) {
      throw new Error(`S3 blob storage requires ${missing.join(', ')}`);
    }
    this.bucket = bucket as string;
    this.client = new S3Client({
      endpoint: env.BLOB_STORAGE_S3_ENDPOINT,
      region: region as string,
      credentials: {
        accessKeyId: accessKeyId as string,
        secretAccessKey: secretAccessKey as string,
      },
      forcePathStyle: env.BLOB_STORAGE_S3_FORCE_PATH_STYLE,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 5000, // 5s to establish connection
        requestTimeout: 30000, // 30s for the full request
      }),
    });
    logger.info(
      { bucket: this.bucket, endpoint: env.BLOB_STORAGE_S3_ENDPOINT, region },
      'Initializing S3 blob storage provider'
    );
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
    try {
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
    } catch (error) {
      logger.error({ key, bucket: this.bucket, error }, 'S3 download failed');
      throw new Error(
        `S3 download failed for key ${key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  async delete(key: string): Promise<void> {
    logger.debug({ key }, 'Deleting from S3');
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
    } catch (error) {
      logger.error({ key, bucket: this.bucket, error }, 'S3 delete failed');
      throw new Error(
        `S3 delete failed for key ${key}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
