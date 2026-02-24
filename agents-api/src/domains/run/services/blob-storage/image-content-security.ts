/**
 * Validates image bytes from untrusted sources (uploaded inline bytes or downloaded data).
 *
 * This prevents non-image payloads from being accepted when they are mislabeled as images.
 * Prefer byte-sniffed types over claimed MIME types whenever possible.
 */
import { fileTypeFromBuffer } from 'file-type';
import {
  ALLOWED_EXTERNAL_IMAGE_MIME_TYPES,
  MAX_EXTERNAL_IMAGE_BYTES,
} from './image-security-constants';

export async function normalizeInlineImageBytes(file: {
  bytes: string;
  mimeType?: string;
}): Promise<{
  data: Uint8Array;
  mimeType: string;
}> {
  const data = Uint8Array.from(Buffer.from(file.bytes, 'base64'));
  validateInlineImageSize(data);

  const sniffedMime = await sniffAllowedImageMimeType(data);
  if (sniffedMime) {
    return { data, mimeType: sniffedMime };
  }

  const providedMimeType = toCanonicalImageMimeType(file.mimeType || '');
  ensureAllowedImageMimeType(providedMimeType || 'application/octet-stream');
  return {
    data,
    mimeType: providedMimeType,
  };
}

export async function resolveDownloadedImageMimeType(
  data: Uint8Array,
  headerContentType: string
): Promise<string> {
  const sniffedMime = await sniffAllowedImageMimeType(data);
  if (sniffedMime) {
    return sniffedMime;
  }

  throw new Error(
    `Blocked external image with unsupported bytes signature (content-type: ${headerContentType || 'unknown'})`
  );
}

export function toCanonicalImageMimeType(mimeType: string): string {
  return mimeType.split(';')[0]?.trim().toLowerCase();
}

export function ensureAllowedImageMimeType(mimeType: string): void {
  const normalizedMime = toCanonicalImageMimeType(mimeType);
  if (!normalizedMime || !ALLOWED_EXTERNAL_IMAGE_MIME_TYPES.has(normalizedMime)) {
    throw new Error(`Blocked image with unsupported mime type: ${mimeType || 'unknown'}`);
  }
}

function validateInlineImageSize(data: Uint8Array): void {
  if (data.length > MAX_EXTERNAL_IMAGE_BYTES) {
    throw new Error(`Blocked inline image exceeding ${MAX_EXTERNAL_IMAGE_BYTES} bytes`);
  }
}

async function sniffAllowedImageMimeType(data: Uint8Array): Promise<string | null> {
  const sniffed = await fileTypeFromBuffer(data);
  const sniffedMime = sniffed?.mime?.toLowerCase();
  if (sniffedMime && ALLOWED_EXTERNAL_IMAGE_MIME_TYPES.has(sniffedMime)) {
    return sniffedMime;
  }

  return null;
}
