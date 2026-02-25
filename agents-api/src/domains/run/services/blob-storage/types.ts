/**
 * Blob payloads are fully buffered in memory for both upload and download.
 *
 * Practical guidance for current usage:
 * - Prefer blobs <= ~20MB each
 * - Avoid high concurrency with large blobs (memory spikes are proportional to payload size)
 *
 * This limit is a guideline, not an enforced hard cap. A streaming interface is the
 * expected path for reliably handling much larger files in the future.
 */
export interface BlobStorageUploadParams {
  key: string;
  data: Buffer | Uint8Array;
  contentType: string;
}

export interface BlobStorageDownloadResult {
  data: Uint8Array;
  contentType: string;
}

export interface BlobStorageProvider {
  upload(params: BlobStorageUploadParams): Promise<void>;
  download(key: string): Promise<BlobStorageDownloadResult>;
  delete(key: string): Promise<void>;
}
