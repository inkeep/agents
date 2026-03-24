export interface BlobStorageUploadParams {
  key: string;
  /** Buffer or Uint8Array; prefer <= ~20MB per blob (guideline, not enforced). */
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
